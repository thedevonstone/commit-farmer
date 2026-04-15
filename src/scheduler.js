/**
 * scheduler.js
 *
 * Determines WHETHER and WHEN to commit based on realistic
 * developer behavior patterns.
 *
 * --- Core decisions this module makes ---
 *
 * shouldCommitToday()
 *   Returns true/false based on:
 *   - Day of week weight from config (Tue/Wed highest, Sat/Sun low)
 *   - Current dry spell length (override if too long)
 *   - Current streak length (force day off if too long)
 *   - Random roll against the day weight
 *
 * getSessionSize(profile)
 *   Returns how many commits to make in this session.
 *   Weighted toward smaller numbers — most sessions are 1-3 commits.
 *   Occasional larger sessions of 5-8 add realism.
 *
 * getSessionTimestamps(count)
 *   Returns an array of Date objects for each commit in the session.
 *   - Session starts at a weighted random hour (afternoon peaks)
 *   - Gap between commits: random 6-52 minutes with jitter
 *   - All times within a single day
 *
 * readState() / writeState(data)
 *   Reads/writes a local .state/run.json file tracking:
 *   - lastCommitDate
 *   - currentStreakDays
 *   - currentDrySpellDays
 *   - totalCommits
 *   This file is gitignored and only exists locally / in Actions runner.
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
 *
 * TODO: implement shouldCommitToday()
 * TODO: implement getSessionSize()
 * TODO: implement getSessionTimestamps()
 * TODO: implement readState() and writeState()
 * TODO: implement weighted random helper
 */
