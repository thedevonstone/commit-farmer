/**
 * reconciler.js
 *
 * Observes the current state of the target repo and returns a "world view"
 * — the list of work units the farmer has in flight, with their stages
 * inferred from observable facts on GitHub.
 *
 * --- Why ---
 *
 * GitHub is the source of truth. The local state file holds analytics
 * counters only (streak, totals, badge counts). What's actually in flight
 * is whatever's open on dev-til right now. This eliminates migration code,
 * makes half-failures self-healing, and means a lost state file isn't fatal.
 *
 * --- World view shape ---
 *
 * Each work unit looks like:
 *   {
 *     id:           'wu-<issueNumber>' | 'wu-pr-<prNumber>' | 'wu-orphan-<branch>'
 *     stage:        'proposed' | 'in_progress' | 'review' | 'merged_not_closed'
 *     issueNumber:  number | null
 *     prNumber:     number | null
 *     branch:       string | null
 *     topic:        string | null
 *     branchAgeDays: number
 *     commitsOnBranch: number
 *   }
 *
 * --- Stage inference rules ---
 *
 *   issue exists, no PR found referencing it          → 'proposed'
 *   issue exists + branch exists (no PR yet)           → 'in_progress'
 *   PR exists, open                                    → 'review'
 *   PR merged recently, linked issue still open        → 'merged_not_closed'
 *
 * --- Marker contract ---
 *
 * The reconciler only sees artifacts marked as farmer-owned:
 *   - Issues: labelled `farmer:v1`
 *   - PRs:    head ref starts with `notes/`  (legacy farmer convention) OR
 *             labelled `farmer:v1`
 *   - Branches: name starts with `notes/`
 *
 * Anything else is invisible to the farmer — protects against future
 * manual edits in dev-til.
 */

const FARMER_LABEL  = 'farmer:v1';
const BRANCH_PREFIX = 'notes/';

// ---------------------------------------------------------------------------
// Low-level fetchers
// ---------------------------------------------------------------------------

/** All open issues we own (labelled farmer:v1, excluding PRs). */
async function fetchFarmerIssues(octokit, owner, repo) {
  const { data } = await octokit.issues.listForRepo({
    owner,
    repo,
    state:    'open',
    labels:   FARMER_LABEL,
    per_page: 100,
  });
  return data
    .filter(i => !i.pull_request)
    .map(i => ({
      number:    i.number,
      title:     i.title,
      createdAt: i.created_at,
      body:      i.body || '',
    }));
}

/** All open PRs we own (notes/ branch prefix). */
async function fetchFarmerPRs(octokit, owner, repo) {
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state:    'open',
    per_page: 100,
  });
  return data
    .filter(pr => pr.head.ref.startsWith(BRANCH_PREFIX))
    .map(pr => ({
      number:    pr.number,
      title:     pr.title,
      branch:    pr.head.ref,
      createdAt: pr.created_at,
      body:      pr.body || '',
    }));
}

/** All open branches under notes/ that may or may not have a PR yet. */
async function fetchFarmerBranches(octokit, owner, repo) {
  // List refs under heads/notes/ — empty array if none exist.
  try {
    const { data } = await octokit.git.listMatchingRefs({
      owner,
      repo,
      ref: `heads/${BRANCH_PREFIX}`,
    });
    return data.map(r => ({
      name: r.ref.replace(/^refs\/heads\//, ''),
      sha:  r.object.sha,
    }));
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/** Returns the commit count on a branch ahead of main. Best-effort. */
async function commitsAhead(octokit, owner, repo, branch) {
  try {
    const { data } = await octokit.repos.compareCommits({
      owner,
      repo,
      base: 'main',
      head: branch,
    });
    return data.ahead_by;
  } catch {
    return 0;
  }
}

/** True if this PR has at least one review submitted on it. */
async function prHasReview(octokit, owner, repo, prNumber) {
  try {
    const { data } = await octokit.pulls.listReviews({
      owner, repo, pull_number: prNumber, per_page: 1,
    });
    return data.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Linking — find the issue an issue/PR/branch is related to
// ---------------------------------------------------------------------------

/**
 * Looks for "fixes #N" / "closes #N" / "resolves #N" or "issue: #N" in
 * the PR body or branch name. Returns the issue number or null.
 */
function extractLinkedIssue(text) {
  if (!text) return null;
  const m = text.match(/(?:fixes|closes|resolves|issue)[\s:#-]+#?(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Extracts topic from a branch name like 'notes/javascript-2026-06-abc1'. */
function extractTopic(branch) {
  if (!branch || !branch.startsWith(BRANCH_PREFIX)) return null;
  const rest = branch.slice(BRANCH_PREFIX.length);
  const first = rest.split('-')[0];
  return first || null;
}

/** Reads the meta footer `<!-- meta: flavor=X topic=Y -->` from a body. */
function extractFlavor(body) {
  if (!body) return null;
  const m = body.match(/<!--\s*meta:\s*flavor=(\w+)/);
  return m ? m[1] : null;
}

/** UTC days between two ISO date strings. */
function daysBetween(isoA, isoB) {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.floor(Math.abs(a - b) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Reconciliation — build the world view
// ---------------------------------------------------------------------------

/**
 * Returns the observed world view: { units: [...], stats: {...} }.
 *
 * Each unit has a derived stage and links to whichever artifacts the
 * farmer can see (issue, PR, branch). The stages are mutually exclusive
 * — every unit is in exactly one stage at any time.
 *
 * Stats are aggregate counts useful for logging and capacity decisions.
 */
async function observe(octokit, owner, repo) {
  const [issues, prs, branches] = await Promise.all([
    fetchFarmerIssues(octokit, owner, repo),
    fetchFarmerPRs(octokit, owner, repo),
    fetchFarmerBranches(octokit, owner, repo),
  ]);

  const now = new Date().toISOString();
  const units = [];
  const claimedBranches = new Set();
  const claimedIssues   = new Set();

  // --- Pass 1: every open PR is a 'review' unit, possibly linked to an issue
  for (const pr of prs) {
    const linkedIssue = extractLinkedIssue(pr.body) ?? extractLinkedIssue(pr.title);
    const issue       = linkedIssue ? issues.find(i => i.number === linkedIssue) : null;

    const [commitsOnBranch, hasReview] = await Promise.all([
      commitsAhead(octokit, owner, repo, pr.branch),
      prHasReview(octokit, owner, repo, pr.number),
    ]);

    units.push({
      id:              `wu-pr-${pr.number}`,
      stage:           'review',
      issueNumber:     issue ? issue.number : null,
      prNumber:        pr.number,
      branch:          pr.branch,
      topic:           extractTopic(pr.branch),
      branchAgeDays:   daysBetween(now, pr.createdAt),
      commitsOnBranch,
      hasReview,
      flavor:          extractFlavor(pr.body) || (issue && extractFlavor(issue.body)),
    });

    claimedBranches.add(pr.branch);
    if (issue) claimedIssues.add(issue.number);
  }

  // --- Pass 2: any notes/ branch without a PR is an 'in_progress' unit
  for (const br of branches) {
    if (claimedBranches.has(br.name)) continue;

    const commitsOnBranch = await commitsAhead(octokit, owner, repo, br.name);
    if (commitsOnBranch === 0) continue; // empty branch — ignore, will be GC'd

    units.push({
      id:              `wu-orphan-${br.name}`,
      stage:           'in_progress',
      issueNumber:     null,
      prNumber:        null,
      branch:          br.name,
      topic:           extractTopic(br.name),
      branchAgeDays:   0, // unknown, treat as fresh
      commitsOnBranch,
    });
  }

  // --- Pass 3: any unclaimed open issue is a 'proposed' unit
  for (const issue of issues) {
    if (claimedIssues.has(issue.number)) continue;

    units.push({
      id:              `wu-${issue.number}`,
      stage:           'proposed',
      issueNumber:     issue.number,
      prNumber:        null,
      branch:          null,
      topic:           null,
      branchAgeDays:   daysBetween(now, issue.createdAt),
      commitsOnBranch: 0,
    });
  }

  const stats = {
    totalUnits:    units.length,
    byStage:       countByStage(units),
    openIssues:    issues.length,
    openPRs:       prs.length,
    farmerBranches: branches.length,
  };

  return { units, stats };
}

function countByStage(units) {
  return units.reduce((acc, u) => {
    acc[u.stage] = (acc[u.stage] || 0) + 1;
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function logWorldView(view) {
  console.log(`[reconciler] observed ${view.stats.totalUnits} work unit(s)`);
  console.log(`[reconciler]   by stage: ${JSON.stringify(view.stats.byStage)}`);
  console.log(`[reconciler]   issues open: ${view.stats.openIssues} | PRs open: ${view.stats.openPRs} | farmer branches: ${view.stats.farmerBranches}`);
  for (const u of view.units) {
    const parts = [
      `[reconciler]   ${u.id}`,
      `stage=${u.stage}`,
      u.issueNumber ? `issue=#${u.issueNumber}` : null,
      u.prNumber    ? `pr=#${u.prNumber}`       : null,
      u.branch      ? `branch=${u.branch}`      : null,
      u.commitsOnBranch ? `commits=${u.commitsOnBranch}` : null,
      `age=${u.branchAgeDays}d`,
    ].filter(Boolean);
    console.log(parts.join(' | '));
  }
}

module.exports = {
  observe,
  logWorldView,
  FARMER_LABEL,
  BRANCH_PREFIX,
};
