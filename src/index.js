/**
 * commit-farmer — entry point
 *
 * Orchestrates a farming session. On each run:
 *   1. Load config, env, and flags
 *   2. Read state
 *   3. Decide whether to commit today (scheduler)
 *   4. If yes, determine session size and timestamps
 *   5. Execute commits with backdated timestamps
 *   6. Handle issue simulation (open/close)
 *   7. Write updated state
 *   8. Log run summary
 *
 * Run modes:
 *   node src/index.js             normal farm run
 *   node src/index.js --dry-run   log what would happen, no real commits
 *   node src/index.js --force     skip probability check, always commit
 */

require('dotenv').config();

const {
  readState,
  writeState,
  computeNextState,
  shouldCommitToday,
  getSessionSize,
  getSessionTimestamps,
} = require('./scheduler');

const { loadProfile } = require('./patterns');
const { getWeightedMessage, getMessage } = require('./messages');
const { makeCommit, getOctokit, getTarget } = require('./committer');
const {
  getOpenIssues,
  openIssue,
  closeIssue,
  shouldOpenIssue,
  shouldCloseIssue,
  getOpenPRs,
  openPRWorkflow,
  mergePR,
  shouldOpenPR,
  shouldMergePR,
} = require('./github-api');

// ---------------------------------------------------------------------------
// Parse CLI flags once at startup
// ---------------------------------------------------------------------------

const flags = {
  dryRun: process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true',
  force:  process.argv.includes('--force')   || process.env.FORCE   === 'true',
};

// ---------------------------------------------------------------------------
// Derive change type from message (maps message prefix to change type)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[commit-farmer] starting run — dry-run: ${flags.dryRun}, force: ${flags.force}`);

  const profile = loadProfile();
  const state   = readState();

  console.log(`[commit-farmer] profile: ${profile.name} | streak: ${state.currentStreakDays} days | dry spell: ${state.currentDrySpellDays} days | total commits: ${state.totalCommits}`);

  // --- Commit decision ---------------------------------------------------

  let decision;
  if (flags.force) {
    decision = { commit: true, forced: true, reason: '--force flag set' };
  } else {
    decision = shouldCommitToday(profile, state);
  }

  console.log(`[scheduler] ${decision.commit ? 'committing' : 'skipping'} — ${decision.reason}`);

  if (!decision.commit) {
    const nextState = computeNextState(state, false, 0);
    writeState(nextState);
    console.log('[commit-farmer] run complete — no commits today');
    return;
  }

  // --- Session planning --------------------------------------------------

  const sessionSize = getSessionSize(profile);
  const timestamps  = getSessionTimestamps(sessionSize);

  console.log(`[scheduler] session: ${sessionSize} commit${sessionSize > 1 ? 's' : ''}`);
  timestamps.forEach((ts, i) => {
    console.log(`[scheduler]   commit ${i + 1}: ${ts.toISOString()}`);
  });

  if (flags.dryRun) {
    console.log('[dry-run] would make the above commits — exiting without pushing');
    return;
  }

  // --- Execute commits ---------------------------------------------------

  const octokit       = getOctokit();
  const { owner, repo } = getTarget();
  let committedCount  = 0;

  for (let i = 0; i < sessionSize; i++) {
    const message    = getWeightedMessage();
    const changeType = changeTypeFromMessage(message);
    const timestamp  = timestamps[i];

    console.log(`[committer] commit ${i + 1}/${sessionSize} — "${message}"`);

    try {
      await makeCommit(changeType, message, timestamp);
      committedCount++;
    } catch (err) {
      console.error(`[committer] commit ${i + 1} failed: ${err.message}`);
      // Continue with remaining commits — partial session is still valid
    }
  }

  // --- Issue simulation --------------------------------------------------

  const openIssueNumbers = await getOpenIssues(octokit, owner, repo).catch(() => []);
  state.openIssues = openIssueNumbers;

  if (shouldCloseIssue(openIssueNumbers.length, state.totalCommits)) {
    const toClose = openIssueNumbers[0];
    await closeIssue(octokit, owner, repo, toClose).catch(err => {
      console.error(`[github-api] failed to close issue #${toClose}: ${err.message}`);
    });
    state.openIssues = openIssueNumbers.filter(n => n !== toClose);
  }

  if (shouldOpenIssue(state.openIssues.length)) {
    const newIssue = await openIssue(octokit, owner, repo).catch(err => {
      console.error(`[github-api] failed to open issue: ${err.message}`);
      return null;
    });
    if (newIssue) state.openIssues.push(newIssue);
  }

  // --- PR simulation -----------------------------------------------------

  const authorName  = process.env.GIT_AUTHOR_NAME  || 'Devon Stone';
  const authorEmail = process.env.GIT_AUTHOR_EMAIL || 'thedevonstone@gmail.com';

  const openPRs = await getOpenPRs(octokit, owner, repo).catch(() => []);
  state.openPRs = openPRs;

  if (shouldMergePR(openPRs.length)) {
    const toMerge = openPRs[0];
    await mergePR(octokit, owner, repo, toMerge.number, toMerge.branch).catch(err => {
      console.error(`[github-api] failed to merge PR #${toMerge.number}: ${err.message}`);
    });
    state.openPRs = openPRs.filter(p => p.number !== toMerge.number);
  }

  if (shouldOpenPR(state.openPRs.length)) {
    const newPR = await openPRWorkflow(octokit, owner, repo, authorName, authorEmail).catch(err => {
      console.error(`[github-api] failed to open PR: ${err.message}`);
      return null;
    });
    if (newPR) state.openPRs.push(newPR);
  }

  // --- Write state -------------------------------------------------------

  const nextState = computeNextState(
    { ...state },
    committedCount > 0,
    committedCount,
  );
  nextState.openIssues = state.openIssues;
  nextState.openPRs    = state.openPRs;
  writeState(nextState);

  // --- Summary -----------------------------------------------------------

  console.log(`[commit-farmer] run complete — ${committedCount}/${sessionSize} commits pushed`);
  console.log(`[state] streak: ${nextState.currentStreakDays} days | total: ${nextState.totalCommits} commits`);
}

main().catch(err => {
  console.error('[commit-farmer] fatal:', err.message);
  process.exit(1);
});
