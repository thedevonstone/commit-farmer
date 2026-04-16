/**
 * github-api.js
 *
 * GitHub API interactions beyond basic commits.
 * Handles issue simulation for a fuller contribution profile.
 * Uses @octokit/rest.
 *
 * --- Why issues matter ---
 *
 * The GitHub contribution graph counts opening issues.
 * A profile with only commits and zero issues looks like someone
 * who never plans work — adding occasional issue activity rounds
 * out the profile naturally.
 *
 * --- Issue lifecycle ---
 *
 * openIssue(octokit, owner, repo)
 *   Creates an issue with a realistic title drawn from the bank below.
 *   Called roughly once every 5-7 days via config.githubApi.issueSimulation.
 *
 * closeIssue(octokit, owner, repo, issueNumber)
 *   Closes an existing open issue.
 *   Called after N commits have been made against that issue.
 *   Creates a natural open → work → close cycle.
 *
 * getOpenIssues(octokit, owner, repo)
 *   Returns array of open issue numbers on the target repo.
 *   Used by index.js to decide whether to close one on this run.
 *
 * shouldOpenIssue(state)
 *   Returns true if conditions are met to open a new issue this run.
 *
 * shouldCloseIssue(state)
 *   Returns true if conditions are met to close an existing issue this run.
 */

const config = require('../config/default.json');

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

/**
 * Returns a random issue title from the bank.
 * Avoids repeating the same title consecutively.
 */
function randomIssueTitle(exclude) {
  const pool = exclude
    ? issueTitles.filter(t => t !== exclude)
    : issueTitles;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Opens a new issue on the target repo.
 * Returns the created issue number.
 */
async function openIssue(octokit, owner, repo) {
  const title = randomIssueTitle();
  const { data } = await octokit.issues.create({ owner, repo, title });
  console.log(`[github-api] opened issue #${data.number}: "${title}"`);
  return data.number;
}

/**
 * Closes an existing issue by number.
 */
async function closeIssue(octokit, owner, repo, issueNumber) {
  await octokit.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: 'closed',
  });
  console.log(`[github-api] closed issue #${issueNumber}`);
}

/**
 * Returns an array of open issue numbers on the target repo.
 * Only fetches issues created by the authenticated user.
 */
async function getOpenIssues(octokit, owner, repo) {
  const { data } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });
  return data.map(i => i.number);
}

/**
 * Returns true if this run should open a new issue.
 * Fires roughly once every openFrequencyDays days.
 * Will not open if there are already 3+ open issues (avoid pile-up).
 */
function shouldOpenIssue(openIssueCount) {
  const cfg = config.githubApi.issueSimulation;
  if (!cfg.enabled) return false;
  if (openIssueCount >= 3) return false;
  // Probability = 1 / openFrequencyDays so it averages out correctly
  return Math.random() < (1 / cfg.openFrequencyDays);
}

/**
 * Returns true if this run should close an existing open issue.
 * Fires after approximately closeAfterCommits commits worth of activity.
 */
function shouldCloseIssue(openIssueCount, totalCommits) {
  const cfg = config.githubApi.issueSimulation;
  if (!cfg.enabled) return false;
  if (openIssueCount === 0) return false;
  // Close probability increases the more commits have been made since
  // the last close opportunity
  return Math.random() < (1 / cfg.closeAfterCommits);
}

module.exports = {
  openIssue,
  closeIssue,
  getOpenIssues,
  shouldOpenIssue,
  shouldCloseIssue,
};
