# commit-farmer

> A transparent, self-aware GitHub contribution graph gardener.

This tool automates commits to a target GitHub repository on a schedule designed
to simulate realistic developer activity. It makes no attempt to hide what it does.
The repo is literally called commit-farmer.

---

## Why this exists

GitHub contribution graphs are a weird proxy for developer activity. They reward
frequent public commits and ignore great work done in private repos, client work,
or anything that does not touch GitHub directly. This project is a transparent,
self-aware response to that reality — and also a genuinely interesting automation
and scheduling problem.

---

## How it works

1. A GitHub Actions workflow runs on a cron schedule
2. The scheduler decides whether to commit based on weighted probability
   (day of week, time of day, recent activity history)
3. If committing, it determines session size — commits happen in bursts like real work
4. Each commit modifies meaningful content in a separate target repository
5. Commit messages are drawn from a realistic bank organized by category
6. Occasionally opens and closes issues and PRs for a fuller contribution profile

---

## Design principles

- **Transparent by design** — the name and README make no attempt to hide this
- **Realistic patterns** — weekday-heavy, session-clustered, with natural dry spells
- **Meaningful content** — commits change real content, not a counter.txt file
- **Configurable** — adjust intensity, timing, and behavior via config
- **No local machine needed** — runs entirely on GitHub Actions

---

## Features

- Weighted day and time probability distribution
- Session clustering (commits happen in groups like real work sessions)
- Dry spell simulation (natural multi-day gaps)
- Commit message generation by category (fix, feat, update, chore, docs)
- GitHub API integration for issue and PR simulation
- Three contributor intensity profiles: light, medium, heavy
- Fully configurable via config/default.json
- GitHub Actions powered and self-contained

---

## Repository structure

```
commit-farmer/
  src/
    index.js          entry point and orchestrator
    scheduler.js      timing and probability logic
    committer.js      git operations via GitHub API
    messages.js       commit message bank
    patterns.js       contributor behavior profiles
    github-api.js     issue and PR simulation
  config/
    default.json      all configurable parameters
  docs/
    HOW-IT-WORKS.md   full technical walkthrough
    PATTERNS.md       timing algorithm and research
    TARGET-REPO.md    how to set up the farm target repo
  .github/
    workflows/
      farm.yml        GitHub Actions schedule
  .env.example        environment variable template
  package.json
```

---

## Target repository

commit-farmer commits to a separate repository — not this one.
The recommended target is a TIL (Today I Learned) style repo, which is a real
pattern used by developers to log short notes as they learn things. This makes
the commit content look natural and the cadence believable.

See docs/TARGET-REPO.md for setup instructions.

---

## Setup (coming soon)

Full setup guide in docs/HOW-IT-WORKS.md once implementation is complete.

---

## Disclaimer

Personal experiment and learning project. The contribution graph is a toy metric anyway.

Built by Devon Stone.
