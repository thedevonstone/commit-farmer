/**
 * work-units.js
 *
 * Lifecycle logic for work units. A work unit is one piece of work that
 * flows through stages (proposed → in_progress → review → merged/closed).
 *
 * --- Two responsibilities ---
 *
 * 1. PLANNER — given the observed world view + profile + session budget,
 *    decide what actions to take today (advance unit X, start unit Y, etc).
 *
 * 2. EXECUTOR — given an action, perform the right API calls and return
 *    success/failure.
 *
 * --- Flavors ---
 *
 * A flavor is a variant of the lifecycle, picked at unit start:
 *
 *   standard (~70%): proposed → in_progress → review → merged → closed
 *   yolo     (~10%): proposed → in_progress → merged (skip review)   — YOLO badge
 *   quickdraw (~5%): proposed → closed inside one run (5-min window) — Quickdraw badge
 *   hotfix   (~10%): in_progress → review → merged (no issue)
 *   direct    (~5%): single commit to main, no PR, no issue
 *
 * The flavor is recorded on the issue body when a unit starts so the
 * reconciler can recover it on later runs (best-effort — if missing,
 * we treat the unit as 'standard').
 *
 * --- Action types ---
 *
 *   { type: 'start_unit', flavor, topic }
 *   { type: 'create_branch', unit }
 *   { type: 'commit_to_branch', unit, message, timestamp }
 *   { type: 'commit_to_main', message, timestamp }
 *   { type: 'open_pr', unit }
 *   { type: 'submit_review', unit }
 *   { type: 'merge_pr', unit }
 *   { type: 'close_issue', unit }
 *   { type: 'quickdraw', topic }
 */

const config = require('../config/default.json');
const { weightedRandom } = require('./patterns');
const { FARMER_LABEL, BRANCH_PREFIX } = require('./reconciler');
const { getEntry, formatEntry } = require('./content');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOPICS = ['javascript', 'git', 'css', 'terminal', 'misc'];

const FLAVOR_WEIGHTS = {
  standard:  70,
  yolo:      10,
  hotfix:    10,
  quickdraw:  5,
  direct:     5,
};

const MAX_UNITS_IN_FLIGHT = 3;

// Stage advancement thresholds (per unit)
const MIN_COMMITS_BEFORE_PR        = 2;
const MAX_BRANCH_AGE_BEFORE_PR_DAYS = 4;
const MIN_PR_AGE_BEFORE_MERGE_DAYS  = 1;
const MAX_PR_AGE_BEFORE_MERGE_DAYS  = 4;

// Per-run probability of injecting a quickdraw cycle. Quickdraw is
// self-contained (open + close inside one run) and doesn't add to the
// in-flight unit count, so it's decoupled from MAX_UNITS_IN_FLIGHT. This
// keeps the Quickdraw badge trickling in even when the farmer is busy
// advancing standard-flow units.
const QUICKDRAW_ROLL_PROBABILITY = 0.20;

// ---------------------------------------------------------------------------
// Issue / PR text templates
// ---------------------------------------------------------------------------

const issueTitlesByTopic = {
  javascript: [
    'add notes on async patterns',
    'expand error handling section',
    'add quick reference entries',
    'clean up older js entries',
  ],
  git: [
    'add git workflow notes',
    'expand rebase section',
    'add notes on git internals',
    'consolidate git references',
  ],
  css: [
    'add css custom properties notes',
    'expand layout section',
    'add grid and flexbox references',
    'clean up older css entries',
  ],
  terminal: [
    'add shell scripting notes',
    'expand ssh section',
    'add terminal shortcuts entries',
    'consolidate terminal references',
  ],
  misc: [
    'add general reference notes',
    'expand architecture section',
    'add notes from recent reading',
    'add quick reference entries',
  ],
};

const prBodies = [
  'Adding a few notes from this week.',
  'Collected references worth keeping.',
  'Been meaning to write these up. Fills in some gaps.',
  'Short notes from recent work.',
  'Quick references that keep coming up.',
];

const reviewBodies = [
  'Looks good. Notes are clear.',
  'Good additions. Examples help.',
  'Solid entries. Worth having written down.',
  'Clean notes. Ready to merge.',
  'Examples make the concepts clear.',
];

const commitMessagesOnBranch = [
  'add notes',
  'add entries',
  'add quick reference',
  'expand notes',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickFlavor() {
  const keys    = Object.keys(FLAVOR_WEIGHTS);
  const weights = keys.map(k => FLAVOR_WEIGHTS[k]);
  return keys[weightedRandom(weights)];
}

function pickTopic() {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

function pickIssueTitle(topic) {
  const pool = issueTitlesByTopic[topic] || issueTitlesByTopic.misc;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildBranchName(topic) {
  const now    = new Date();
  const month  = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${BRANCH_PREFIX}${topic}-${month}-${suffix}`;
}

function buildIssueBody(flavor, topic) {
  // Flavor + topic stored as a tiny machine-readable footer so the reconciler
  // can recover a unit's original flavor on later runs. Plain markdown — no
  // tells, looks like a note to self.
  const bodies = [
    `Notes from this week — collecting in one place.`,
    `Want to expand the ${topic} section a bit.`,
    `Few entries worth writing up before I forget.`,
    `Cleaning up and adding some references.`,
  ];
  const body = bodies[Math.floor(Math.random() * bodies.length)];
  return `${body}\n\n<!-- meta: flavor=${flavor} topic=${topic} -->`;
}

function readFlavorFromBody(body) {
  if (!body) return null;
  const m = body.match(/<!--\s*meta:\s*flavor=(\w+)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Planner — decides today's actions from the world view
// ---------------------------------------------------------------------------

/**
 * Returns an ordered list of actions for today.
 *
 * actionBudget: how many "things" we want to do today. Roughly the session
 * size from the scheduler. Each action consumes some budget (a commit = 1,
 * opening a PR = 1, etc).
 */
function planActions(view, profile, actionBudget) {
  const actions = [];
  let budget = actionBudget;

  if (budget <= 0) return actions;

  // --- 1. Advance existing units first (they're already in motion) -------

  for (const unit of view.units) {
    if (budget <= 0) break;

    const advance = decideAdvance(unit);
    if (!advance) continue;

    for (const a of advance) {
      actions.push(a);
      budget -= 1;
      if (budget <= 0) break;
    }
  }

  // --- 2. Roll for a self-contained quickdraw cycle ---------------------
  // Runs independently of MAX_UNITS_IN_FLIGHT so the badge keeps progressing
  // even when the farmer is saturated with standard-flow units.

  if (budget > 0 && Math.random() < QUICKDRAW_ROLL_PROBABILITY) {
    actions.push({ type: 'quickdraw', topic: pickTopic() });
    budget -= 1;
  }

  // --- 3. Start a new unit if there's room and budget -------------------

  const inFlight = view.units.length;
  if (budget > 0 && inFlight < MAX_UNITS_IN_FLIGHT) {
    const flavor = pickFlavor();
    const topic  = pickTopic();

    // Quickdraw + direct are self-contained — they fit in one budget slot.
    if (flavor === 'quickdraw') {
      actions.push({ type: 'quickdraw', topic });
      budget -= 1;
    } else if (flavor === 'direct') {
      actions.push({ type: 'commit_to_main', topic });
      budget -= 1;
    } else if (flavor === 'hotfix') {
      // Hotfix starts at branch creation (no issue).
      actions.push({ type: 'start_unit', flavor, topic, skipIssue: true });
      budget -= 1;
    } else {
      actions.push({ type: 'start_unit', flavor, topic, skipIssue: false });
      budget -= 1;
    }
  }

  // --- 4. Use remaining budget on follow-on commits to in-progress units

  if (budget > 0) {
    const inProgress = view.units.filter(u => u.stage === 'in_progress');
    for (const unit of inProgress) {
      if (budget <= 0) break;
      actions.push({ type: 'commit_to_branch', unit });
      budget -= 1;
    }
  }

  return actions;
}

/**
 * Given a single unit, decide what (if anything) should happen to it today.
 * Returns an array of zero or more actions for this unit.
 */
function decideAdvance(unit) {
  const flavor = unit.flavor || 'standard';

  switch (unit.stage) {
    case 'proposed':
      // No branch yet — create one + first commit.
      return [{ type: 'create_branch', unit }];

    case 'in_progress':
      // If we have enough commits OR branch is old enough, open the PR.
      // Review/merge happen on subsequent runs — one stage per unit per run.
      if (
        unit.commitsOnBranch >= MIN_COMMITS_BEFORE_PR ||
        unit.branchAgeDays   >= MAX_BRANCH_AGE_BEFORE_PR_DAYS
      ) {
        return [{ type: 'open_pr', unit }];
      }
      return [{ type: 'commit_to_branch', unit }];

    case 'review': {
      // First touch: submit a review (unless flavor=yolo, which skips it).
      if (!unit.hasReview && flavor !== 'yolo') {
        return [{ type: 'submit_review', unit }];
      }
      // YOLO: merge immediately once at review. Skipping the age/probability
      // gate is the whole point — YOLO = "shipped without waiting", so the
      // badge should land on the first run the PR is visible.
      if (flavor === 'yolo') {
        const actions = [{ type: 'merge_pr', unit }];
        if (unit.issueNumber) actions.push({ type: 'close_issue', unit });
        return actions;
      }
      // Standard flow: consider merging if the PR is old enough.
      if (unit.branchAgeDays >= MIN_PR_AGE_BEFORE_MERGE_DAYS) {
        const rollChance = unit.branchAgeDays >= MAX_PR_AGE_BEFORE_MERGE_DAYS
          ? 1.0
          : 0.5;
        if (Math.random() < rollChance) {
          const actions = [{ type: 'merge_pr', unit }];
          if (unit.issueNumber) actions.push({ type: 'close_issue', unit });
          return actions;
        }
      }
      return [];
    }

    case 'merged_not_closed':
      return unit.issueNumber ? [{ type: 'close_issue', unit }] : [];

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Executor — performs one action against GitHub
// ---------------------------------------------------------------------------

async function ensureLabelExists(octokit, owner, repo) {
  try {
    await octokit.issues.getLabel({ owner, repo, name: FARMER_LABEL });
  } catch (err) {
    if (err.status !== 404) throw err;
    await octokit.issues.createLabel({
      owner,
      repo,
      name:        FARMER_LABEL,
      color:       'cccccc',
      description: 'Farmer-owned work unit. Reconciler watches this label.',
    });
  }
}

async function fetchFileSafe(octokit, owner, repo, path, ref) {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (err.status === 404) return '';
    throw err;
  }
}

async function commitToBranchRaw(
  octokit, owner, repo, branch, filePath, content, message, timestamp,
  authorName, authorEmail
) {
  const isoDate = timestamp.toISOString();

  const { data: refData } = await octokit.git.getRef({
    owner, repo, ref: `heads/${branch}`,
  });
  const headSha = refData.object.sha;

  const { data: commitData } = await octokit.git.getCommit({
    owner, repo, commit_sha: headSha,
  });
  const treeSha = commitData.tree.sha;

  const { data: blobData } = await octokit.git.createBlob({
    owner,
    repo,
    content:  Buffer.from(content).toString('base64'),
    encoding: 'base64',
  });

  const { data: treeData } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: treeSha,
    tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blobData.sha }],
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree:      treeData.sha,
    parents:   [headSha],
    author:    { name: authorName, email: authorEmail, date: isoDate },
    committer: { name: authorName, email: authorEmail, date: isoDate },
  });

  await octokit.git.updateRef({
    owner, repo, ref: `heads/${branch}`, sha: newCommit.sha,
  });

  return newCommit.sha;
}

/**
 * Executes one planned action. Returns a summary object describing what
 * happened so the caller can update badge counters.
 *
 * Each action is independent — failure of one doesn't block the others.
 * If an action fails, the next reconciler run will see the partial state
 * and either retry or skip naturally.
 */
async function executeAction(action, ctx) {
  const { octokit, owner, repo, authorName, authorEmail, timestamp } = ctx;

  switch (action.type) {
    // -----------------------------------------------------------------
    case 'start_unit': {
      const { flavor, topic, skipIssue } = action;

      if (skipIssue) {
        // Hotfix flavor: jump straight to branch creation.
        const branch = buildBranchName(topic);
        await createBranchFromMain(octokit, owner, repo, branch);
        await initialBranchCommit(octokit, owner, repo, branch, topic, timestamp, authorName, authorEmail);
        console.log(`[work-units] started ${flavor} unit (no issue) on ${branch}`);
        return { kind: 'unit_started', flavor };
      }

      await ensureLabelExists(octokit, owner, repo);
      const title = pickIssueTitle(topic);
      const body  = buildIssueBody(flavor, topic);

      const { data: issue } = await octokit.issues.create({
        owner, repo, title, body, labels: [FARMER_LABEL],
      });

      console.log(`[work-units] opened issue #${issue.number} (${flavor}/${topic}): "${title}"`);
      return { kind: 'unit_started', flavor, issueNumber: issue.number };
    }

    // -----------------------------------------------------------------
    case 'create_branch': {
      const { unit } = action;
      const topic    = unit.topic || pickTopic();
      const branch   = buildBranchName(topic);

      await createBranchFromMain(octokit, owner, repo, branch);
      await initialBranchCommit(octokit, owner, repo, branch, topic, timestamp, authorName, authorEmail);
      console.log(`[work-units] created branch ${branch} for unit ${unit.id}`);
      return { kind: 'branch_created', branch };
    }

    // -----------------------------------------------------------------
    case 'commit_to_branch': {
      const { unit } = action;
      if (!unit.branch) {
        console.log(`[work-units] skipping commit_to_branch — unit ${unit.id} has no branch`);
        return { kind: 'skipped' };
      }
      const topic    = unit.topic || pickTopic();
      const month    = monthString();
      const filePath = `${topic}/${month}.md`;
      const existing = await fetchFileSafe(octokit, owner, repo, filePath, unit.branch);
      const entry    = getEntry(topic);
      const content  = existing + formatEntry(entry);
      const message  = pickCommitMessage();

      await commitToBranchRaw(
        octokit, owner, repo, unit.branch, filePath, content, message, timestamp,
        authorName, authorEmail,
      );
      console.log(`[work-units] commit on ${unit.branch}: "${message}"`);
      return { kind: 'commit_on_branch' };
    }

    // -----------------------------------------------------------------
    case 'commit_to_main': {
      // Direct flavor: single commit to main, no PR, no issue.
      const { makeCommit } = require('./committer');
      const { getWeightedMessage } = require('./messages');
      const message = getWeightedMessage();
      const changeType = changeTypeFromMessage(message);
      await makeCommit(changeType, message, timestamp);
      return { kind: 'commit_on_main' };
    }

    // -----------------------------------------------------------------
    case 'open_pr': {
      const { unit } = action;
      const topic    = unit.topic || pickTopic();
      const title    = pickIssueTitle(topic);
      const body     = unit.issueNumber
        ? `${prBodies[Math.floor(Math.random() * prBodies.length)]}\n\nCloses #${unit.issueNumber}.`
        : prBodies[Math.floor(Math.random() * prBodies.length)];

      const { data: pr } = await octokit.pulls.create({
        owner, repo, title, body, head: unit.branch, base: 'main',
      });

      // Label PR so reconciler can find it even if branch prefix changes.
      try {
        await ensureLabelExists(octokit, owner, repo);
        await octokit.issues.addLabels({
          owner, repo, issue_number: pr.number, labels: [FARMER_LABEL],
        });
      } catch { /* non-fatal */ }

      console.log(`[work-units] opened PR #${pr.number}: "${title}"`);
      return { kind: 'pr_opened', prNumber: pr.number };
    }

    // -----------------------------------------------------------------
    case 'submit_review': {
      const { unit } = action;
      const body = reviewBodies[Math.floor(Math.random() * reviewBodies.length)];
      await octokit.pulls.createReview({
        owner, repo, pull_number: unit.prNumber, body, event: 'COMMENT',
      });
      console.log(`[work-units] submitted review on PR #${unit.prNumber}`);
      return { kind: 'review_submitted' };
    }

    // -----------------------------------------------------------------
    case 'merge_pr': {
      const { unit } = action;
      try {
        await octokit.pulls.merge({
          owner, repo, pull_number: unit.prNumber, merge_method: 'merge',
        });
      } catch (err) {
        // Conflict / not-mergeable → close the PR + delete branch.
        // A real dev would abandon a stale conflicted PR rather than fight it.
        const msg = (err.message || '').toLowerCase();
        const isConflict = msg.includes('conflict') || msg.includes('not mergeable');
        if (isConflict) {
          console.log(`[work-units] PR #${unit.prNumber} has conflicts — closing instead of merging`);
          await closePRAndBranch(octokit, owner, repo, unit.prNumber, unit.branch);
          return { kind: 'pr_closed_conflict', prNumber: unit.prNumber };
        }
        throw err;
      }
      try {
        await octokit.git.deleteRef({
          owner, repo, ref: `heads/${unit.branch}`,
        });
      } catch { /* branch may already be gone */ }
      console.log(`[work-units] merged PR #${unit.prNumber} and deleted ${unit.branch}`);
      return {
        kind:      'pr_merged',
        prNumber:  unit.prNumber,
        flavor:    unit.flavor || 'standard',
        hadReview: unit.hasReview === true,
      };
    }

    // -----------------------------------------------------------------
    case 'close_issue': {
      const { unit } = action;
      await octokit.issues.update({
        owner, repo, issue_number: unit.issueNumber, state: 'closed',
      });
      console.log(`[work-units] closed issue #${unit.issueNumber}`);
      return { kind: 'issue_closed' };
    }

    // -----------------------------------------------------------------
    case 'quickdraw': {
      // Open issue, wait ~30s, close it. Counts for Quickdraw badge.
      const topic = action.topic;
      await ensureLabelExists(octokit, owner, repo);
      const title = pickIssueTitle(topic);
      const body  = `Small note — handled.\n\n<!-- meta: flavor=quickdraw topic=${topic} -->`;

      const { data: issue } = await octokit.issues.create({
        owner, repo, title, body, labels: [FARMER_LABEL],
      });
      console.log(`[work-units] quickdraw issue #${issue.number} opened`);

      await sleep(30_000 + Math.floor(Math.random() * 30_000)); // 30-60s

      await octokit.issues.update({
        owner, repo, issue_number: issue.number, state: 'closed',
      });
      console.log(`[work-units] quickdraw issue #${issue.number} closed (Quickdraw badge)`);
      return { kind: 'quickdraw_complete' };
    }

    default:
      console.log(`[work-units] unknown action type: ${action.type}`);
      return { kind: 'unknown' };
  }
}

// ---------------------------------------------------------------------------
// Sub-helpers used by the executor
// ---------------------------------------------------------------------------

async function closePRAndBranch(octokit, owner, repo, prNumber, branch) {
  try {
    await octokit.pulls.update({
      owner, repo, pull_number: prNumber, state: 'closed',
    });
  } catch (err) {
    console.log(`[work-units] could not close PR #${prNumber}: ${err.message}`);
  }
  try {
    await octokit.git.deleteRef({
      owner, repo, ref: `heads/${branch}`,
    });
  } catch {
    /* branch may already be gone */
  }
}

async function createBranchFromMain(octokit, owner, repo, branch) {
  const { data: refData } = await octokit.git.getRef({
    owner, repo, ref: 'heads/main',
  });
  await octokit.git.createRef({
    owner, repo, ref: `refs/heads/${branch}`, sha: refData.object.sha,
  });
}

async function initialBranchCommit(octokit, owner, repo, branch, topic, timestamp, authorName, authorEmail) {
  const month    = monthString();
  const filePath = `${topic}/${month}.md`;
  const existing = await fetchFileSafe(octokit, owner, repo, filePath, branch);
  const entry    = getEntry(topic);
  const content  = existing + formatEntry(entry);
  const message  = pickCommitMessage();

  await commitToBranchRaw(
    octokit, owner, repo, branch, filePath, content, message, timestamp,
    authorName, authorEmail,
  );
}

function monthString() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function pickCommitMessage() {
  return commitMessagesOnBranch[Math.floor(Math.random() * commitMessagesOnBranch.length)];
}

function changeTypeFromMessage(message) {
  if (message.startsWith('fix') || message.startsWith('correct')) return 'fix';
  if (message.startsWith('add'))                                    return 'add';
  if (message.startsWith('tidy') ||
      message.startsWith('reorganize') ||
      message.startsWith('normalize') ||
      message.startsWith('remove') ||
      message.startsWith('sort') ||
      message.startsWith('consolidate'))                            return 'chore';
  return 'update';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Action logging — for dry-run output
// ---------------------------------------------------------------------------

function describeAction(action) {
  switch (action.type) {
    case 'start_unit':
      return `start ${action.flavor} unit (${action.topic})${action.skipIssue ? ' [no issue]' : ''}`;
    case 'create_branch':
      return `create branch for ${action.unit.id}`;
    case 'commit_to_branch':
      return `commit to ${action.unit.branch || '<branch tbd>'}`;
    case 'commit_to_main':
      return `single commit to main (direct flavor)`;
    case 'open_pr':
      return `open PR for ${action.unit.id} (branch ${action.unit.branch})`;
    case 'submit_review':
      return `submit review on PR #${action.unit.prNumber}`;
    case 'merge_pr':
      return `merge PR #${action.unit.prNumber}`;
    case 'close_issue':
      return `close issue #${action.unit.issueNumber}`;
    case 'quickdraw':
      return `quickdraw cycle (${action.topic})`;
    default:
      return JSON.stringify(action);
  }
}

module.exports = {
  planActions,
  executeAction,
  describeAction,
  readFlavorFromBody,
  pickFlavor,
  pickTopic,
  FLAVOR_WEIGHTS,
  MAX_UNITS_IN_FLIGHT,
};
