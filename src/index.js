/**
 * commit-farmer — entry point (reconciler-first)
 *
 * On each run:
 *   1. Acquire lock (abort if another run is in flight)
 *   2. Load config + profile + analytics state
 *   3. Decide whether today is an active day (existing scheduler logic)
 *   4. Observe the current world from GitHub (reconciler)
 *   5. Plan today's actions from the observed world (work-units planner)
 *   6. Execute each action with backdated timestamps (work-units executor)
 *   7. Update analytics state (badge counters, streak, totals)
 *   8. Release lock
 *
 * GitHub is the source of truth for what's in flight. The state file holds
 * only analytics — losing it doesn't break the farmer.
 *
 * Run modes:
 *   node src/index.js                   normal run
 *   node src/index.js --dry-run         log what would happen, no API writes
 *   node src/index.js --reconcile-only  print world view + planned actions, exit
 *   node src/index.js --force           skip day-roll, always run today
 */

require('dotenv').config();

const {
  readState,
  writeState,
  computeNextState,
  shouldCommitToday,
  getSessionSize,
  getSessionTimestamps,
  acquireLock,
  releaseLock,
} = require('./scheduler');

const { loadProfile } = require('./patterns');
const { getOctokit, getTarget } = require('./committer');
const { observe, logWorldView } = require('./reconciler');
const { planActions, executeAction, describeAction } = require('./work-units');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const flags = {
  dryRun:        process.argv.includes('--dry-run')        || process.env.DRY_RUN        === 'true',
  reconcileOnly: process.argv.includes('--reconcile-only') || process.env.RECONCILE_ONLY === 'true',
  force:         process.argv.includes('--force')          || process.env.FORCE          === 'true',
};

// ---------------------------------------------------------------------------
// Update badge counters based on action results
// ---------------------------------------------------------------------------

function updateBadgeStats(stats, result) {
  if (!result) return stats;
  switch (result.kind) {
    case 'pr_merged':         stats.pullShark   = (stats.pullShark   || 0) + 1; break;
    case 'quickdraw_complete': stats.quickdraw  = (stats.quickdraw   || 0) + 1; break;
    // YOLO is counted when a PR is merged without a review action having run.
    // We tag it in the action loop via a flag on the result, not here.
    default: break;
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[commit-farmer] starting run — dry-run: ${flags.dryRun}, reconcile-only: ${flags.reconcileOnly}, force: ${flags.force}`);

  // --- Lock ---------------------------------------------------------------

  const lock = acquireLock();
  if (!lock.acquired) {
    console.log(`[commit-farmer] aborting: ${lock.reason}`);
    process.exit(0);
  }

  try {
    await runFarmer();
  } finally {
    releaseLock();
  }
}

async function runFarmer() {
  const profile = loadProfile();
  const state   = readState();

  console.log(`[commit-farmer] profile: ${profile.name} | streak: ${state.currentStreakDays}d | dry spell: ${state.currentDrySpellDays}d | total commits: ${state.totalCommits}`);
  console.log(`[commit-farmer] badges: pullShark=${state.badgeStats.pullShark} quickdraw=${state.badgeStats.quickdraw} yolo=${state.badgeStats.yolo}`);

  // --- Active day decision -----------------------------------------------

  let decision;
  if (flags.force || flags.reconcileOnly) {
    decision = { commit: true, forced: true, reason: flags.reconcileOnly ? 'reconcile-only' : '--force' };
  } else {
    decision = shouldCommitToday(profile, state);
  }

  console.log(`[scheduler] ${decision.commit ? 'active' : 'idle'} — ${decision.reason}`);

  if (!decision.commit) {
    if (!flags.dryRun && !flags.reconcileOnly) {
      const nextState = computeNextState(state, false, 0);
      writeState(nextState);
    }
    console.log('[commit-farmer] run complete — no actions today');
    return;
  }

  // --- Observe the world -------------------------------------------------

  const octokit       = getOctokit();
  const { owner, repo } = getTarget();
  const authorName    = process.env.GIT_AUTHOR_NAME  || 'Devon Stone';
  const authorEmail   = process.env.GIT_AUTHOR_EMAIL || 'thedevonstone@gmail.com';

  const view = await observe(octokit, owner, repo);
  logWorldView(view);

  // --- Plan today's actions ----------------------------------------------

  const sessionSize = getSessionSize(profile);
  const timestamps  = getSessionTimestamps(sessionSize);
  const actions     = planActions(view, profile, sessionSize);

  console.log(`[planner] session size: ${sessionSize} | planned actions: ${actions.length}`);
  actions.forEach((a, i) => {
    const ts = timestamps[i] ? timestamps[i].toISOString() : '<no slot>';
    console.log(`[planner]   ${i + 1}. ${describeAction(a)} @ ${ts}`);
  });

  if (flags.reconcileOnly) {
    console.log('[reconcile-only] world view + plan above — no actions executed');
    return;
  }
  if (flags.dryRun) {
    console.log('[dry-run] would execute the above actions — exiting');
    return;
  }

  // --- Execute -----------------------------------------------------------

  // Anything in this set creates a green square on the contribution graph.
  const GRAPH_EVENT_KINDS = new Set([
    'commit_on_branch',
    'commit_on_main',
    'branch_created',
    'unit_started',     // issue opened
    'pr_opened',
    'review_submitted',
    'pr_merged',
    'quickdraw_complete',
  ]);

  let graphEvents = 0;
  for (let i = 0; i < actions.length; i++) {
    const action    = actions[i];
    const timestamp = timestamps[i] || timestamps[timestamps.length - 1] || new Date();
    const ctx       = { octokit, owner, repo, authorName, authorEmail, timestamp };

    try {
      const result = await executeAction(action, ctx);
      updateBadgeStats(state.badgeStats, result);

      if (GRAPH_EVENT_KINDS.has(result.kind)) graphEvents += 1;

      // YOLO badge: a PR merged without ever receiving a review.
      // Source of truth is the PR's review state on GitHub (captured in
      // hadReview by the reconciler) — NOT the order of actions in this run.
      if (result.kind === 'pr_merged' && result.hadReview === false) {
        state.badgeStats.yolo = (state.badgeStats.yolo || 0) + 1;
      }
    } catch (err) {
      console.error(`[executor] action ${i + 1} failed: ${err.message}`);
      // Continue — next reconciler run will see the partial state and resume.
    }
  }

  // --- Update analytics state -------------------------------------------

  const nextState = computeNextState(state, graphEvents > 0, graphEvents);
  nextState.badgeStats = state.badgeStats;
  writeState(nextState);

  console.log(`[commit-farmer] run complete — ${graphEvents} contribution graph event(s)`);
  console.log(`[state] streak: ${nextState.currentStreakDays}d | total: ${nextState.totalCommits} | badges: pullShark=${nextState.badgeStats.pullShark} yolo=${nextState.badgeStats.yolo} quickdraw=${nextState.badgeStats.quickdraw}`);
}

main().catch(err => {
  console.error('[commit-farmer] fatal:', err.message);
  releaseLock();
  process.exit(1);
});
