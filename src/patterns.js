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
 *
 * TODO: implement loadProfile(name)
 * TODO: implement applyDrySpellLogic(profile, state)
 * TODO: implement applyStreakBreakerLogic(profile, state)
 */
