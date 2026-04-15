# How It Works

A full technical walkthrough of the commit-farmer system.

---

## Overview

commit-farmer runs on GitHub Actions. Every time a cron trigger fires,
the farmer script wakes up, decides whether to commit based on probability,
and if yes, makes one or more commits to a separate target repository.
It then goes back to sleep until the next trigger.

The key insight: not every trigger results in a commit. The scheduler
adds a probability layer on top of the cron schedule so the resulting
pattern is irregular and human-like rather than perfectly uniform.

---

## The two-repo design

This project uses two repositories:

**commit-farmer** (this repo)
Contains the automation code. Public. Transparent about what it does.

**dev-til** (target repo, set up separately)
The repo that actually receives commits. A TIL (Today I Learned) style
repo where entries are added regularly. This is the repo that shows on
the contribution graph.

Why separate repos? If commit-farmer committed to itself, every run would
show up as changes to automation code, which is obviously mechanical.
The target repo looks like a real ongoing project.

---

## Decision flow on each run

```
GitHub Actions cron fires
        |
        v
Load config + state
        |
        v
Is today a dry spell override day? (no commits in 6+ days)
  YES -> force a small session
  NO  -> continue
        |
        v
Is today a streak breaker day? (8+ consecutive days)
  YES -> skip today
  NO  -> continue
        |
        v
Roll against day-of-week weight
  FAIL -> exit, no commits today
  PASS -> continue
        |
        v
Determine session size (1-N commits, weighted low)
        |
        v
Generate session timestamps
(cluster in a time window with random gaps)
        |
        v
For each commit:
  - Select target file
  - Generate content change
  - Build commit message
  - Push via GitHub API with custom timestamp
        |
        v
Maybe open/close an issue (low frequency)
        |
        v
Write updated state
        |
        v
Done
```

---

## Timestamp backdating

This is the most technically interesting part.

GitHub Actions jobs run at a specific real-world time, but commits do not
have to be timestamped at that time. The GitHub Git Data API accepts
custom `author.date` and `committer.date` fields, allowing commits to
appear at any timestamp.

This means:
- The cron job fires at 2:15pm UTC
- The scheduler decides to make 3 commits for a morning session
- Those commits are timestamped at 9:12am, 9:34am, and 10:08am
- On the contribution graph, they appear as a normal morning work session

The API endpoint that supports this is:
`POST /repos/{owner}/{repo}/git/commits`

This is part of the lower-level Git Data API, not the higher-level
repository contents API.

---

## State management

The farmer maintains a small state file (`.state/run.json`) that tracks:

```json
{
  "lastCommitDate": "2026-04-15",
  "currentStreakDays": 3,
  "currentDrySpellDays": 0,
  "totalCommits": 47,
  "openIssues": [12, 15]
}
```

In a GitHub Actions environment this state does not persist between runs
by default. Options for persisting it:

1. Commit the state file back to this repo after each run (simplest)
2. Store in a GitHub Actions cache (faster, less noise)
3. Store in a GitHub Gist (external, clean)

Option 1 is recommended to start — the state commits will also add
to the contribution graph which is a nice bonus.

---

## Security

The FARM_TOKEN secret gives write access to the target repository only.
Use a fine-grained personal access token scoped to just that repo.
Never commit real tokens. The .env file is gitignored.

---

## Adding a new contributor profile

Edit `config/default.json` and add a new key to the `profiles` object:

```json
"sprint": {
  "description": "Two-week sprint mode — high activity then drop off",
  "commitDaysPerWeek": 6,
  "sessionSizeMin": 3,
  "sessionSizeMax": 12,
  "drySpellDaysMin": 0,
  "drySpellDaysMax": 1
}
```

Then set `INTENSITY=sprint` in your secrets or .env.
