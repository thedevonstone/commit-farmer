/**
 * scheduler.js
 *
 * Determines WHETHER and WHEN to commit based on realistic
 * developer behavior patterns.
 *
 * --- Core decisions this module makes ---
 *
 * shouldCommitToday(profile, state)
 *   Returns { commit: bool, forced?: bool, reason: string } based on:
 *   - Streak breaker (force skip if too many consecutive days)
 *   - Dry spell override (force commit if too many days without activity)
 *   - Day of week weight roll
 *
 * getSessionSize(profile)
 *   Returns how many commits to make in this session.
 *   Weighted toward smaller numbers — most sessions are 1-3 commits.
 *
 * getSessionTimestamps(count)
 *   Returns an array of Date objects for each commit in the session.
 *   - Session start picked from weighted time windows (afternoon peaks)
 *   - Gap between commits: random 6-52 minutes with jitter, skewed short
 *   - All times anchored to today's UTC date
 *
 * readState() / writeState(data)
 *   Atomic reads/writes to .state/run.json.
 *   readState() recomputes currentDrySpellDays from lastCommitDate
 *   on every read so the count stays accurate even when runs are missed.
 *
 * computeNextState(prevState, committed, commitCount)
 *   Returns the updated state object after a run completes.
 *   Call this only after all commits have been confirmed pushed.
 *
 * --- Probability model ---
 *
 * Real developer data suggests:
 *   - Most active devs commit 3-5 days per week
 *   - Sessions cluster (not one commit every 4 hours uniformly)
 *   - At least one full day off per week
 *   - Dry spells of 3-7 days happen roughly once a month
 *   - Peak hours: 2pm-6pm local, secondary peak 9am-11am
 *   - Late night commits exist but are rare (adds realism, keep < 5%)
 */

const fs   = require('fs');
const path = require('path');
const config = require('../config/default.json');
const { weightedRandom, applyDrySpellLogic, applyStreakBreakerLogic } = require('./patterns');

const STATE_DIR  = path.resolve(__dirname, '../.state');
const STATE_PATH = path.join(STATE_DIR, 'run.json');
const LOCK_PATH  = path.join(STATE_DIR, 'run.lock');

const STALE_LOCK_AGE_MS = 30 * 60 * 1000; // 30 min — anything older is dead

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a UTC date string "YYYY-MM-DD" for the given Date object. */
function toUTCDateString(date) {
  return date.toISOString().split('T')[0];
}

/** Returns how many full calendar days have elapsed since dateString (UTC). */
function daysSince(dateString) {
  if (!dateString) return Infinity;
  const then  = new Date(dateString + 'T00:00:00Z').getTime();
  const today = new Date(toUTCDateString(new Date()) + 'T00:00:00Z').getTime();
  return Math.floor((today - then) / 86_400_000);
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

/**
 * Reads .state/run.json, returning safe defaults if the file is missing
 * or corrupt (first run, or crashed write).
 *
 * currentDrySpellDays is recomputed from lastCommitDate every time so it
 * stays accurate even if GitHub Actions skips a day without firing.
 */
function readState() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    state = defaultState();
  }

  // Migrate older state files: drop fields that are now derived from GitHub
  // (openIssues, openPRs) and add new analytics fields if missing.
  delete state.openIssues;
  delete state.openPRs;
  state.badgeStats = state.badgeStats || {
    pullShark:  0,
    yolo:       0,
    quickdraw:  0,
    galaxyBrain: 0,
  };
  state.lastCommitDate      = state.lastCommitDate      || null;
  state.currentStreakDays   = state.currentStreakDays   || 0;
  state.totalCommits        = state.totalCommits        || 0;

  // Recompute dry spell from lastCommitDate — stored count can lag if
  // an Actions job fires, rolls "no commit", and that day goes uncounted.
  const days = daysSince(state.lastCommitDate);
  state.currentDrySpellDays = days === Infinity ? 0 : Math.max(0, days - 1);

  return state;
}

function defaultState() {
  return {
    lastCommitDate:      null,
    currentStreakDays:   0,
    currentDrySpellDays: 0,
    totalCommits:        0,
    badgeStats: {
      pullShark:  0,
      yolo:       0,
      quickdraw:  0,
      galaxyBrain: 0,
    },
  };
}

/**
 * Writes state atomically: temp file first, then rename.
 * Prevents half-written state if the process is killed mid-write.
 * Creates .state/ directory if it doesn't exist.
 */
function writeState(data) {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

/**
 * Returns the updated state object to persist after a run.
 * committed: whether any commits were made this run.
 * commitCount: how many commits were made (0 if not committed).
 *
 * Call ONLY after all commits are confirmed pushed — never before.
 */
function computeNextState(prevState, committed, commitCount) {
  const today     = toUTCDateString(new Date());
  const yesterday = toUTCDateString(new Date(Date.now() - 86_400_000));

  if (!committed) {
    return {
      ...prevState,
      currentStreakDays:    0,
      currentDrySpellDays: prevState.currentDrySpellDays + 1,
    };
  }

  // Streak extends if yesterday was also a commit day, resets otherwise.
  const newStreak = prevState.lastCommitDate === yesterday
    ? prevState.currentStreakDays + 1
    : 1;

  return {
    ...prevState,
    lastCommitDate:      today,
    currentStreakDays:   newStreak,
    currentDrySpellDays: 0,
    totalCommits:        prevState.totalCommits + commitCount,
  };
}

// ---------------------------------------------------------------------------
// Scheduling decisions
// ---------------------------------------------------------------------------

/**
 * Decides whether to commit today.
 * Returns { commit: bool, forced?: bool, reason: string }
 *
 * Priority order:
 *   1. Streak breaker — can force a skip
 *   2. Dry spell override — can force a commit (overrides the day roll)
 *   3. Day of week weight roll
 */
function shouldCommitToday(profile, state) {
  // 1. Streak breaker takes highest priority
  const streak = applyStreakBreakerLogic(profile, state);
  if (streak.forceSkip) {
    return { commit: false, reason: streak.reason };
  }

  // 2. Dry spell override — commit even on an otherwise quiet day
  const drySpell = applyDrySpellLogic(profile, state);
  if (drySpell.forceCommit) {
    return { commit: true, forced: true, reason: drySpell.reason };
  }

  // 3. Day of week weight roll
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today      = days[new Date().getUTCDay()];
  const dayWeight  = config.schedule.dayWeights[today];
  const roll       = Math.random();
  const rollStr    = roll.toFixed(3);
  const weightStr  = dayWeight.toFixed(2);

  if (roll > dayWeight) {
    return {
      commit: false,
      reason: `day roll failed — ${today} weight ${weightStr}, rolled ${rollStr}`,
    };
  }

  return {
    commit: true,
    reason: `day roll passed — ${today} weight ${weightStr}, rolled ${rollStr}`,
  };
}

/**
 * Returns how many commits to make in this session.
 * Distribution is skewed toward the low end of the profile's range —
 * a power curve models the real-world pattern where most sessions
 * are small (1-2 commits) with occasional larger bursts.
 */
function getSessionSize(profile) {
  const { sessionSizeMin, sessionSizeMax } = profile;
  const range = sessionSizeMax - sessionSizeMin;
  // Math.pow(random, 1.8) skews [0,1) toward 0 (small values more likely)
  const skewed = Math.pow(Math.random(), 1.8);
  return sessionSizeMin + Math.floor(skewed * (range + 1));
}

/**
 * Returns an array of `count` Date objects representing when each commit
 * in the session should appear on the contribution graph.
 *
 * Steps:
 *   1. Pick a time window weighted by config.schedule.hourWindows
 *   2. Pick a random session start within that window
 *   3. Space subsequent commits with realistic randomised gaps
 *
 * All timestamps are anchored to today's UTC date.
 * The late-night window (23:00–7:00) wraps past midnight — commits
 * in that window are still attributed to today's UTC date.
 */
function getSessionTimestamps(count) {
  const windows = config.schedule.hourWindows;
  const windowIdx = weightedRandom(windows.map(w => w.weight));
  const win = windows[windowIdx];

  // Handle midnight-wrapping windows (e.g. late night: start=23, end=7)
  let endHour = win.end;
  if (endHour <= win.start) endHour += 24;
  const windowDurationMinutes = (endHour - win.start) * 60;

  // Random start within the window, in minutes-from-midnight
  const startOffsetMinutes = Math.floor(Math.random() * windowDurationMinutes);
  const sessionStartMinutes = win.start * 60 + startOffsetMinutes;

  const today = new Date();
  const baseDateUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );

  const { minGapMinutes, maxGapMinutes, gapJitterMinutes } = config.sessions;
  const timestamps = [];
  let cursorMinutes = sessionStartMinutes;

  for (let i = 0; i < count; i++) {
    timestamps.push(new Date(baseDateUTC + cursorMinutes * 60 * 1000));

    if (i < count - 1) {
      // Gap skewed toward shorter values (power curve), plus uniform jitter
      const rawGap = minGapMinutes
        + Math.pow(Math.random(), 1.5) * (maxGapMinutes - minGapMinutes);
      const jitter = (Math.random() * 2 - 1) * gapJitterMinutes;
      cursorMinutes += Math.max(minGapMinutes, Math.round(rawGap + jitter));
    }
  }

  return timestamps;
}

// ---------------------------------------------------------------------------
// Lock file — prevents concurrent runs from stomping each other
// ---------------------------------------------------------------------------

function acquireLock() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }

  if (fs.existsSync(LOCK_PATH)) {
    const stat = fs.statSync(LOCK_PATH);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < STALE_LOCK_AGE_MS) {
      return {
        acquired: false,
        reason:   `lock held — ${Math.round(ageMs / 1000)}s old (max ${STALE_LOCK_AGE_MS / 1000}s)`,
      };
    }
    // Stale lock — overwrite it.
    console.log(`[scheduler] removing stale lock (age ${Math.round(ageMs / 60000)}m)`);
  }

  fs.writeFileSync(LOCK_PATH, JSON.stringify({
    pid:       process.pid,
    startedAt: new Date().toISOString(),
  }));
  return { acquired: true };
}

function releaseLock() {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch { /* missing is fine */ }
}

module.exports = {
  readState,
  writeState,
  computeNextState,
  shouldCommitToday,
  getSessionSize,
  getSessionTimestamps,
  acquireLock,
  releaseLock,
};
