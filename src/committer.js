/**
 * committer.js
 *
 * Handles all git operations against the target repository.
 * Uses the GitHub Git Data API via Octokit — no local git clone needed.
 * This is what allows commits to appear at custom timestamps.
 *
 * --- The 6-step Git Data API sequence ---
 *
 * Every commit requires this exact sequence:
 *
 *   1. GET  git/ref/heads/main          → current HEAD SHA
 *   2. GET  git/commits/{headSha}        → current tree SHA
 *   3. POST git/blobs                    → upload new file content, get blob SHA
 *   4. POST git/trees                    → create new tree with updated blob, get tree SHA
 *   5. POST git/commits                  → create commit with custom timestamp, get commit SHA
 *   6. PATCH git/refs/heads/main         → advance branch ref to new commit SHA
 *
 * Skipping or reordering any step breaks the tree.
 * Step 5 is where author.date and committer.date are set — this is
 * what makes commits appear at the scheduled time on the contribution graph.
 *
 * --- File selection strategy ---
 *
 * Most commits (70%) update the current month's TIL file for a topic.
 * Occasionally (20%) the index.md is updated.
 * Rarely (10%) an older month file gets a minor edit.
 *
 * --- Content generation ---
 *
 * change types mirror the message categories:
 *   'add'    → append a new short entry to the file
 *   'update' → append a minor clarification or expansion note
 *   'fix'    → append a small correction note
 *   'chore'  → append a structural tidy note to index.md
 */

require('dotenv').config();
const { Octokit } = require('@octokit/rest');

// ---------------------------------------------------------------------------
// Octokit singleton — initialized once, shared across all calls
// ---------------------------------------------------------------------------

let _octokit = null;

function getOctokit() {
  if (!_octokit) {
    if (!process.env.FARM_TOKEN) {
      throw new Error('[committer] FARM_TOKEN is not set in environment');
    }
    _octokit = new Octokit({ auth: process.env.FARM_TOKEN });
  }
  return _octokit;
}

function getTarget() {
  const raw = process.env.TARGET_REPO;
  if (!raw || !raw.includes('/')) {
    throw new Error('[committer] TARGET_REPO must be in owner/repo format');
  }
  const [owner, repo] = raw.split('/');
  return { owner, repo };
}

// ---------------------------------------------------------------------------
// Retry helper — wraps any async fn with exponential backoff
// ---------------------------------------------------------------------------

async function withRetry(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = Math.pow(2, attempt) * 500;
      console.log(`[committer] attempt ${attempt} failed (${err.message}), retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ---------------------------------------------------------------------------
// File selection
// ---------------------------------------------------------------------------

const topics = ['javascript', 'git', 'css', 'terminal', 'misc'];

/**
 * Returns the file path to modify for this commit.
 * Weighted toward current-month topic files (realistic churn pattern).
 */
function getTargetFile(changeType) {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const roll = Math.random();

  if (changeType === 'chore' || roll > 0.90) {
    // 10% chance: update the index
    return 'index.md';
  }

  // 90%: update a topic file for the current month
  const topic = topics[Math.floor(Math.random() * topics.length)];
  return `${topic}/${month}.md`;
}

// ---------------------------------------------------------------------------
// Content generation
// ---------------------------------------------------------------------------

const { getEntry, formatEntry } = require('./content');

const fixSnippets = [
  '\n\n<!-- fixed: typo in previous entry -->\n',
  '\n\n<!-- fixed: corrected code example -->\n',
  '\n\n<!-- fixed: updated broken link -->\n',
  '\n\n<!-- fixed: heading level adjusted -->\n',
];

const indexUpdateSnippets = [
  '\n\n<!-- index updated -->\n',
  '\n\n<!-- added recent entries to index -->\n',
  '\n\n<!-- reorganized section -->\n',
];

/**
 * Extracts the topic name from a file path.
 * 'javascript/2026-04.md' → 'javascript'
 * 'index.md' → null
 */
function topicFromPath(filePath) {
  const parts = filePath.split('/');
  return parts.length > 1 ? parts[0] : null;
}

/**
 * Returns the new full file content after applying the change.
 * existingContent: the current file content as a string.
 * changeType: 'add' | 'update' | 'fix' | 'chore'
 * filePath: used to derive topic and detect index.md
 *
 * add + update → append a real TIL entry from the content bank
 * fix + chore  → append a lightweight comment (minor edit simulation)
 */
function generateContent(existingContent, changeType, filePath) {
  const isIndex = filePath === 'index.md';

  if (isIndex) {
    const snippet = indexUpdateSnippets[Math.floor(Math.random() * indexUpdateSnippets.length)];
    return existingContent + snippet;
  }

  switch (changeType) {
    case 'add':
    case 'update': {
      const topic = topicFromPath(filePath);
      const entry = getEntry(topic);
      return existingContent + formatEntry(entry);
    }
    case 'fix': {
      const snippet = fixSnippets[Math.floor(Math.random() * fixSnippets.length)];
      return existingContent + snippet;
    }
    case 'chore': {
      const snippet = indexUpdateSnippets[Math.floor(Math.random() * indexUpdateSnippets.length)];
      return existingContent + snippet;
    }
    default:
      throw new Error(`[committer] unknown changeType: ${changeType}`);
  }
}

// ---------------------------------------------------------------------------
// Core commit function — the 6-step Git Data API sequence
// ---------------------------------------------------------------------------

/**
 * Fetches the current content of a file from the target repo.
 * Returns an empty string if the file does not exist yet (new file).
 */
async function fetchFileContent(octokit, owner, repo, filePath) {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: filePath });
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (err.status === 404) return '';
    throw err;
  }
}

/**
 * Pushes a single backdated commit to the target repo.
 *
 * filePath:  relative path in the repo (e.g. 'javascript/2026-04.md')
 * content:   full new file content as a string
 * message:   commit message string
 * timestamp: Date object — used for both author.date and committer.date
 *
 * Returns the new commit SHA.
 */
async function commitFile(filePath, content, message, timestamp) {
  const octokit = getOctokit();
  const { owner, repo } = getTarget();
  const isoDate = timestamp.toISOString();
  const authorName  = process.env.GIT_AUTHOR_NAME  || 'Devon Stone';
  const authorEmail = process.env.GIT_AUTHOR_EMAIL || 'thedevonstone@gmail.com';

  return withRetry(async () => {
    // Step 1 — get current HEAD SHA
    const { data: refData } = await octokit.git.getRef({
      owner, repo, ref: 'heads/main',
    });
    const headSha = refData.object.sha;

    // Step 2 — get the tree SHA from the current HEAD commit
    const { data: commitData } = await octokit.git.getCommit({
      owner, repo, commit_sha: headSha,
    });
    const treeSha = commitData.tree.sha;

    // Step 3 — create a blob with the new file content
    const { data: blobData } = await octokit.git.createBlob({
      owner,
      repo,
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    });

    // Step 4 — create a new tree that points to the new blob
    const { data: treeData } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: treeSha,
      tree: [{
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      }],
    });

    // Step 5 — create the commit with the backdated timestamp
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: treeData.sha,
      parents: [headSha],
      author:    { name: authorName, email: authorEmail, date: isoDate },
      committer: { name: authorName, email: authorEmail, date: isoDate },
    });

    // Step 6 — advance the branch ref to the new commit
    await octokit.git.updateRef({
      owner,
      repo,
      ref: 'heads/main',
      sha: newCommit.sha,
    });

    return newCommit.sha;
  });
}

// ---------------------------------------------------------------------------
// High-level: run one full commit (select file → generate → push)
// ---------------------------------------------------------------------------

/**
 * Executes a single commit in the farming session.
 * changeType: 'add' | 'update' | 'fix' | 'chore' (drives file selection + content)
 * message:    commit message string from messages.js
 * timestamp:  Date object from scheduler.getSessionTimestamps()
 *
 * Returns the new commit SHA.
 */
async function makeCommit(changeType, message, timestamp) {
  const octokit = getOctokit();
  const { owner, repo } = getTarget();

  const filePath       = getTargetFile(changeType);
  const existingContent = await fetchFileContent(octokit, owner, repo, filePath);
  const newContent     = generateContent(existingContent, changeType, filePath);
  const sha            = await commitFile(filePath, newContent, message, timestamp);

  console.log(`[committer] committed ${filePath} at ${timestamp.toISOString()} — ${sha.slice(0, 7)}`);
  return sha;
}

module.exports = { makeCommit, getOctokit, getTarget };
