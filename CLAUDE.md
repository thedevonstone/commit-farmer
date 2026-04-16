# commit-farmer — Engineering Standards

## What This Is

A GitHub Actions automation tool that makes commits to a separate target repo (`dev-til`) to maintain a realistic contribution graph. Fully transparent — the repo is public and documents exactly what it does.

## Stack

- Runtime: Node.js (CommonJS, no transpilation)
- GitHub API: `@octokit/rest` (Git Data API for backdated commits)
- Config: `config/default.json` + `dotenv` for secrets
- Environment: GitHub Actions (cron-triggered, unattended)
- Language: JavaScript (no TypeScript — keep it simple for a solo CLI tool)

## Project Structure

```
commit-farmer/
├── src/
│   ├── index.js          ← orchestration only, wires everything together
│   ├── scheduler.js      ← timing decisions, state r/w
│   ├── committer.js      ← git operations via GitHub API
│   ├── github-api.js     ← issue/PR simulation
│   ├── messages.js       ← commit message generation
│   └── patterns.js       ← timestamp math, session clustering
├── config/
│   └── default.json      ← profiles, day weights, time windows
├── docs/
│   ├── HOW-IT-WORKS.md   ← full technical walkthrough
│   ├── PATTERNS.md       ← timing model details
│   └── TARGET-REPO.md    ← target repo setup guide
└── .state/
    └── run.json          ← gitignored, persisted back to repo between runs
```

## Two-Repo Design

This repo (`commit-farmer`) contains the automation code. It commits to a separate **target repo** (`dev-til`) — a TIL-style journal where entries accumulate naturally. Never commit to commit-farmer itself as part of the farming run.

## Critical: Backdated Commits

Commits use the **Git Data API** (not the Repos contents API) so `author.date` and `committer.date` can be custom-set. The session timestamps are chosen by `scheduler.js` and passed to `committer.js`. The GitHub Actions job fires at one time; the commits appear at a different (realistic) time.

Endpoint: `POST /repos/{owner}/{repo}/git/commits` with custom `author.date` / `committer.date`.

## Module Ownership

- `scheduler.js` — all timing decisions, state read/write
- `committer.js` — all git operations via API
- `github-api.js` — issue/PR simulation only
- `messages.js` — commit message templates only
- `patterns.js` — probability math, session clustering only
- `index.js` — orchestration only, no business logic

Never let business logic leak into `index.js`. Never let `committer.js` make scheduling decisions.

## Non-Negotiables

- `FARM_TOKEN` never hardcoded, always from `process.env`
- State writes are atomic (write temp file, rename)
- State written AFTER all commits succeed, never before
- Every GitHub API write uses `withRetry()` for transient failures
- Every run logs its decisions with bracketed prefixes for Actions visibility
- `--dry-run` mode logs what would happen, makes zero API calls

## Environment Variables

```
FARM_TOKEN=<fine-grained PAT scoped to target repo only>
TARGET_OWNER=<github username>
TARGET_REPO=dev-til
INTENSITY=medium  # or casual, active, sprint — maps to config profiles
```

## Skills Active in This Repo

- **full-output-enforcement** — never truncate code output
- **nodejs-backend-standards** — async patterns, retry logic, state management, module boundaries specific to this codebase
