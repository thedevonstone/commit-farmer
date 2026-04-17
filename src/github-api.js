/**
 * github-api.js
 *
 * GitHub API interactions beyond basic commits.
 * Handles issue and PR simulation for a fuller contribution profile.
 * Uses @octokit/rest.
 *
 * --- Why this matters ---
 *
 * The GitHub contribution graph counts four things:
 *   1. Commits to the default branch
 *   2. Opening issues
 *   3. Opening pull requests
 *   4. Submitting pull request reviews
 *
 * This module handles 2, 3, and 4. A profile with only commits looks
 * like someone who never plans or reviews work. The combination of all
 * four creates a profile that reads like a real working developer.
 *
 * --- Issue lifecycle ---
 *
 * open → work (commits land) → close
 * Frequency: roughly once every 5 days.
 *
 * --- PR lifecycle ---
 *
 * open branch → commit 2-3 times → open PR → submit review → merge
 * Frequency: roughly once every 10 days.
 * Each PR cycle generates: branch commits + PR open + review + merge.
 */

const config = require('../config/default.json');
const { getEntry, formatEntry } = require('./content');

// ---------------------------------------------------------------------------
// Issue simulation
// ---------------------------------------------------------------------------

const issueTitles = [
  'add entries for testing patterns',
  'review and update older notes',
  'reorganize entries by topic',
  'add entries from this week',
  'clean up formatting across files',
  'add quick reference section for git',
  'consolidate short notes into longer entries',
  'add entries on debugging techniques',
  'review css section for accuracy',
  'add entries on terminal shortcuts',
  'update index with recent entries',
  'expand javascript async notes',
  'add entries on performance patterns',
  'review and fix broken links',
  'add entries from reading this week',
];

function randomIssueTitle(exclude) {
  const pool = exclude ? issueTitles.filter(t => t !== exclude) : issueTitles;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function openIssue(octokit, owner, repo) {
  const title = randomIssueTitle();
  const { data } = await octokit.issues.create({ owner, repo, title });
  console.log(`[github-api] opened issue #${data.number}: "${title}"`);
  return data.number;
}

async function closeIssue(octokit, owner, repo, issueNumber) {
  await octokit.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: 'closed',
  });
  console.log(`[github-api] closed issue #${issueNumber}`);
}

async function getOpenIssues(octokit, owner, repo) {
  const { data } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });
  // Filter to exclude PRs (GitHub returns PRs in issues list)
  return data.filter(i => !i.pull_request).map(i => i.number);
}

function shouldOpenIssue(openIssueCount) {
  const cfg = config.githubApi.issueSimulation;
  if (!cfg.enabled) return false;
  if (openIssueCount >= 3) return false;
  return Math.random() < (1 / cfg.openFrequencyDays);
}

function shouldCloseIssue(openIssueCount) {
  const cfg = config.githubApi.issueSimulation;
  if (!cfg.enabled) return false;
  if (openIssueCount === 0) return false;
  return Math.random() < (1 / cfg.closeAfterCommits);
}

// ---------------------------------------------------------------------------
// PR simulation
// ---------------------------------------------------------------------------

const topics = ['javascript', 'git', 'css', 'terminal', 'misc'];

const prTitlesByTopic = {
  javascript: [
    'add js async patterns and array methods',
    'add notes on modern javascript features',
    'expand error handling and debugging section',
    'add javascript quick references',
  ],
  git: [
    'add git workflow and command notes',
    'expand rebase and history editing section',
    'add notes on git internals',
    'add git quick reference entries',
  ],
  css: [
    'add notes on modern css features',
    'expand layout and animation section',
    'add css grid and flexbox references',
    'add notes on css custom properties',
  ],
  terminal: [
    'add terminal workflow and tool notes',
    'expand shell scripting section',
    'add notes on ssh and remote tools',
    'add terminal quick reference entries',
  ],
  misc: [
    'add general reference and api notes',
    'expand architecture and debugging section',
    'add notes from recent reading',
    'add quick reference entries',
  ],
};

const prBodies = [
  'Adding a few notes from this week. Small additions across the section.',
  'Collected some useful references worth keeping. Nothing groundbreaking but handy.',
  'Been meaning to write these up. Fills in some gaps in the existing notes.',
  'Short notes from recent work. Good to have them written down.',
  'A few quick references that keep coming up. Easier to have them here.',
];

const reviewBodies = [
  'Looks good. Notes are clear and concise.',
  'Good additions. The examples are helpful.',
  'Solid entries. A couple could use more detail later but good to get them in.',
  'Clean notes. Worth having these written down.',
  'Good to merge. The examples make the concepts clear.',
];

/**
 * Creates a new branch in the target repo off the current main HEAD.
 * Returns the branch name and the HEAD SHA it was created from.
 */
async function createBranch(octokit, owner, repo, branchName) {
  const { data: refData } = await octokit.git.getRef({
    owner, repo, ref: 'heads/main',
  });
  const headSha = refData.object.sha;

  await octokit.git.createRef({
    owner,
    repo,
    ref:  `refs/heads/${branchName}`,
    sha:  headSha,
  });

  return headSha;
}

/**
 * Commits a file to a specific branch using the Git Data API.
 * Same 6-step sequence as committer.js but targets the given branch.
 */
async function commitToBranch(octokit, owner, repo, branch, filePath, content, message, timestamp, authorName, authorEmail) {
  const isoDate = timestamp.toISOString();

  // Step 1 — current branch HEAD
  const { data: refData } = await octokit.git.getRef({
    owner, repo, ref: `heads/${branch}`,
  });
  const headSha = refData.object.sha;

  // Step 2 — tree SHA from HEAD
  const { data: commitData } = await octokit.git.getCommit({
    owner, repo, commit_sha: headSha,
  });
  const treeSha = commitData.tree.sha;

  // Step 3 — blob
  const { data: blobData } = await octokit.git.createBlob({
    owner,
    repo,
    content:  Buffer.from(content).toString('base64'),
    encoding: 'base64',
  });

  // Step 4 — tree
  const { data: treeData } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: treeSha,
    tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blobData.sha }],
  });

  // Step 5 — commit with backdated timestamp
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree:      treeData.sha,
    parents:   [headSha],
    author:    { name: authorName, email: authorEmail, date: isoDate },
    committer: { name: authorName, email: authorEmail, date: isoDate },
  });

  // Step 6 — advance branch ref
  await octokit.git.updateRef({
    owner, repo, ref: `heads/${branch}`, sha: newCommit.sha,
  });

  return newCommit.sha;
}

/**
 * Runs the full PR open workflow:
 *   1. Create a branch
 *   2. Make 2-3 real content commits on the branch
 *   3. Open the PR
 *   4. Submit a review comment (counts as a review contribution)
 *
 * Returns { number, branch } for tracking in state.
 */
async function openPRWorkflow(octokit, owner, repo, authorName, authorEmail) {
  const now     = new Date();
  const month   = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const topic   = topics[Math.floor(Math.random() * topics.length)];
  const suffix  = Math.random().toString(36).slice(2, 6); // short random suffix
  const branch  = `notes/${topic}-${month}-${suffix}`;

  console.log(`[github-api] creating PR branch: ${branch}`);

  // Create branch
  await createBranch(octokit, owner, repo, branch);

  // Make 2 commits on the branch, spaced realistically
  const commitCount = Math.random() < 0.4 ? 3 : 2;
  const baseMinutes = 9 * 60 + Math.floor(Math.random() * 120); // 9am–11am window

  for (let i = 0; i < commitCount; i++) {
    const filePath  = `${topic}/${month}.md`;
    const entry     = getEntry(topic);
    const existing  = await fetchFileSafe(octokit, owner, repo, filePath, branch);
    const content   = existing + formatEntry(entry);
    const minutes   = baseMinutes + i * (15 + Math.floor(Math.random() * 20));
    const timestamp = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    ) + minutes * 60 * 1000);

    const messages = ['add notes', 'add entries', 'add quick reference'];
    const message  = messages[Math.floor(Math.random() * messages.length)];

    await commitToBranch(octokit, owner, repo, branch, filePath, content, message, timestamp, authorName, authorEmail);
    console.log(`[github-api] branch commit ${i + 1}/${commitCount} on ${branch}`);
  }

  // Open the PR
  const titles  = prTitlesByTopic[topic];
  const title   = titles[Math.floor(Math.random() * titles.length)];
  const body    = prBodies[Math.floor(Math.random() * prBodies.length)];

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head: branch,
    base: 'main',
  });

  console.log(`[github-api] opened PR #${pr.number}: "${title}"`);

  // Submit a review comment (counts as a review contribution)
  const reviewBody = reviewBodies[Math.floor(Math.random() * reviewBodies.length)];
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: pr.number,
    body:        reviewBody,
    event:       'COMMENT',
  });

  console.log(`[github-api] submitted review on PR #${pr.number}`);

  return { number: pr.number, branch };
}

/**
 * Merges an open PR and deletes the branch.
 */
async function mergePR(octokit, owner, repo, prNumber, branchName) {
  await octokit.pulls.merge({
    owner,
    repo,
    pull_number:   prNumber,
    merge_method: 'merge',
  });

  // Delete the branch
  try {
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
  } catch {
    // Non-fatal — branch may already be deleted
  }

  console.log(`[github-api] merged PR #${prNumber} and deleted branch ${branchName}`);
}

/**
 * Returns open PR objects from the target repo.
 * Returns array of { number, branch } matching PRs we opened.
 */
async function getOpenPRs(octokit, owner, repo) {
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state:    'open',
    per_page: 50,
  });
  return data
    .filter(pr => pr.head.ref.startsWith('notes/'))
    .map(pr => ({ number: pr.number, branch: pr.head.ref }));
}

function shouldOpenPR(openPRCount) {
  const cfg = config.githubApi.prSimulation;
  if (!cfg.enabled) return false;
  if (openPRCount >= 2) return false; // never pile up more than 2 open PRs
  return Math.random() < (1 / cfg.openFrequencyDays);
}

function shouldMergePR(openPRCount) {
  const cfg = config.githubApi.prSimulation;
  if (!cfg.enabled) return false;
  if (openPRCount === 0) return false;
  return Math.random() < (1 / cfg.mergeAfterDays);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches file content from a specific branch. Returns empty string if missing.
 */
async function fetchFileSafe(octokit, owner, repo, path, ref) {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (err.status === 404) return '';
    throw err;
  }
}

module.exports = {
  // Issues
  openIssue,
  closeIssue,
  getOpenIssues,
  shouldOpenIssue,
  shouldCloseIssue,
  // PRs
  openPRWorkflow,
  mergePR,
  getOpenPRs,
  shouldOpenPR,
  shouldMergePR,
};
