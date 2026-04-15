# Timing Patterns

How the scheduler models realistic developer behavior.

---

## Day of week weights

Not all days are equal. The scheduler assigns a probability weight to
each day of the week based on observed patterns in real developer profiles.

| Day       | Weight | Notes                              |
|-----------|--------|------------------------------------|
| Monday    | 0.75   | Getting back into it               |
| Tuesday   | 1.00   | Peak day                           |
| Wednesday | 1.00   | Peak day                           |
| Thursday  | 0.90   | Still strong                       |
| Friday    | 0.60   | Drop-off in the afternoon          |
| Saturday  | 0.20   | Occasional, not regular            |
| Sunday    | 0.15   | Rare, but happens                  |

A weight of 1.00 does not mean a commit always happens — it means
the probability is at its maximum for that profile's base rate.
A weight of 0.15 means commits on that day are quite rare.

---

## Time of day windows

Within a commit day, the time is selected from a weighted window:

| Window        | Hours       | Weight | Notes                        |
|---------------|-------------|--------|------------------------------|
| Early morning | 7am - 9am   | 0.40   | Occasional early starts      |
| Morning       | 9am - 12pm  | 0.70   | Secondary peak               |
| Midday        | 12pm - 2pm  | 0.40   | Lunch dip                    |
| Afternoon     | 2pm - 5pm   | 1.00   | Primary peak                 |
| Evening       | 5pm - 8pm   | 0.70   | After-work sessions          |
| Night         | 8pm - 11pm  | 0.25   | Occasional late work         |
| Late night    | 11pm - 7am  | 0.05   | Rare — adds realism          |

---

## Session clustering

Real developers do not commit once every four hours on a schedule.
They work in sessions — a burst of 2-6 commits over 30-90 minutes,
then nothing for hours or days.

The scheduler models this by:

1. Picking a session start time (from the weighted window above)
2. Picking a session size (1-N commits, weighted toward low numbers)
3. Spacing commits within the session with random gaps

Gap distribution between commits in a session:
- Minimum: 6 minutes
- Maximum: 52 minutes
- With jitter: +/- 8 minutes
- Distribution: skewed toward shorter gaps (most work happens fast)

Result: a 4-commit session might have gaps of 12, 28, and 9 minutes.
That looks like: write something, review it, adjust, push — normal.

---

## Dry spell simulation

No developer commits every single day. Gaps are normal and expected.
Gaps that never happen are suspicious.

The scheduler tracks consecutive no-commit days and:

- Allows natural dry spells of 1-3 days (medium profile)
- Forces a commit if the dry spell exceeds 6 days (override)
- This prevents the graph from going completely dark for long periods

The override uses a small forced session (1-2 commits) to avoid
a long gap that would look like the automation broke.

---

## Streak breaking

The opposite problem: never missing a day for months is also a red flag.
Commit streaks of 365 days do not happen naturally.

The scheduler:
- Tracks consecutive commit days
- Forces a skip day after 8 consecutive days
- This prevents perfect streaks that signal automation

---

## Combining it all

On any given run, the scheduler:

1. Checks streak breaker — maybe force a skip
2. Checks dry spell override — maybe force a commit
3. Gets the day weight for today
4. Rolls a random number against that weight
5. If passing, determines session size and timestamps
6. Returns a plan for the committer to execute

The result is a contribution graph that has natural rhythm —
active weekdays, occasional weekends, real gaps, no perfect patterns.
