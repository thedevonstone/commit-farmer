/**
 * patterns.js
 *
 * Contributor behavior profiles and pattern utilities.
 *
 * --- Built-in profiles ---
 *
 * light
 *   Casual contributor. Commits a couple times a week.
 *   Sessions are small (1-3 commits). Frequent dry spells.
 *   Good for: not drawing too much attention, subtle graph fill.
 *
 * medium
 *   Active contributor. Most weekdays have some activity.
 *   Sessions of 1-6 commits. Short dry spells.
 *   Good for: looks like someone with a real side project.
 *
 * heavy
 *   Very active. Nearly every day, larger sessions.
 *   Looks like someone in the middle of a big project.
 *   Good for: a concentrated sprint period. Use sparingly.
 *
 * --- Pattern research ---
 *
 * Based on analysis of public GitHub profiles of working developers:
 *
 * Commit frequency:
 *   - Median active developer commits 3-4 days per week
 *   - Weekday/weekend ratio roughly 4:1
 *   - Tuesday and Wednesday are the most common commit days
 *   - Friday afternoon drop-off is visible across many profiles
 *
 * Session behavior:
 *   - Commits cluster into sessions separated by hours or days
 *   - A single commit in a day is common (quick fix or small update)
 *   - Large single-day counts (10+) happen but are rare
 *   - Gap between commits in a session: typically 10-40 minutes
 *
 * Dry spells:
 *   - Virtually all active developers have gaps of 3-7 days occasionally
 *   - Month boundaries often show lower activity
 *   - Holiday periods create visible gaps
 *   - Perfectly continuous graphs with no gaps look automated
 *
 * Streak breakers:
 *   - A perfect 365-day streak is a red flag
 *   - Real devs take weekends off at least occasionally
 *   - Forced day-off logic prevents suspicious perfection
 */

const config = require('../config/default.json');

/**
 * Weighted random index selection.
 * weights: array of non-negative numbers.
 * Returns the index of the selected item.
 */
function weightedRandom(weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1; // float rounding fallback
}

/**
 * Loads a named profile from config.
 * Falls back to config.intensity if name is not provided.
 * Falls back to 'medium' if neither is set.
 * Throws if the profile name is not found in config.
 */
function loadProfile(name) {
  const profileName = name || process.env.INTENSITY || config.intensity || 'medium';
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new Error(`[patterns] unknown profile: "${profileName}". Valid options: ${Object.keys(config.profiles).join(', ')}`);
  }
  return { name: profileName, ...profile };
}

/**
 * Checks whether the current dry spell should force a commit today.
 * Returns { forceCommit: bool, reason?: string }
 *
 * The dry spell is the number of consecutive days without a commit.
 * state.currentDrySpellDays is recomputed dynamically in readState()
 * from lastCommitDate so it stays accurate even if runs are missed.
 */
function applyDrySpellLogic(profile, state) {
  const cfg = config.drySpellOverride;
  if (!cfg.enabled) return { forceCommit: false };

  if (state.currentDrySpellDays >= cfg.triggerAfterDays) {
    return {
      forceCommit: true,
      reason: `dry spell override — ${state.currentDrySpellDays} days without a commit (threshold: ${cfg.triggerAfterDays})`,
    };
  }

  return { forceCommit: false };
}

/**
 * Checks whether the current streak should force a skip today.
 * Returns { forceSkip: bool, reason?: string }
 *
 * Prevents suspiciously long unbroken streaks.
 */
function applyStreakBreakerLogic(profile, state) {
  const cfg = config.streakBreaker;
  if (!cfg.enabled) return { forceSkip: false };

  if (state.currentStreakDays >= cfg.triggerAfterDays) {
    return {
      forceSkip: true,
      reason: `streak breaker — ${state.currentStreakDays} consecutive days (threshold: ${cfg.triggerAfterDays})`,
    };
  }

  return { forceSkip: false };
}

module.exports = { weightedRandom, loadProfile, applyDrySpellLogic, applyStreakBreakerLogic };
