---
name: nodejs-backend-standards
description: >
  Apply this skill whenever writing, reviewing, or modifying Node.js code in commit-farmer.
  Use when implementing async logic, GitHub API calls, scheduling, state persistence,
  error handling, CLI flags, or any module in src/. Apply when debugging why a run
  silently fails, why retries are not happening, or why state is inconsistent between runs.
---

# Node.js Backend Standards — commit-farmer

## The Three Laws of This Codebase

1. **Every async operation must handle failure** — GitHub Actions runs are unattended. Silent failures become invisible bugs.
2. **State transitions must be atomic** — A run that crashes mid-write leaves corrupt state. Write state at the end, never mid-run.
3. **The output log is the only debugger** — Every meaningful decision and failure must be console-logged with context. No silent exits.

## Async Patterns

### Always await, never fire-and-forget
```javascript
// BAD — error is swallowed
commitFile(file, content, message, timestamp);

// GOOD — error surfaces and stops the run
await commitFile(file, content, message, timestamp);
```

### Error propagation — throw up, log at the top
Low-level functions throw. The top-level `main()` catches and logs.
Never swallow errors in helper functions.

```javascript
// BAD — caller has no idea what happened
async function commitFile(file, content, message, ts) {
  try {
    await octokit.git.createCommit({ ... });
  } catch (e) {
    console.error(e); // swallowed — caller proceeds as if nothing happened
  }
}

// GOOD — failure propagates
async function commitFile(file, content, message, ts) {
  await octokit.git.createCommit({ ... }); // throws on failure
}

// top level catches everything
async function main() {
  try {
    await runSession();
  } catch (err) {
    console.error('[commit-farmer] fatal:', err.message);
    process.exit(1);
  }
}
```

### Retry logic for transient GitHub API failures
GitHub API calls can fail transiently (rate limit, network blip, 502).
Use exponential backoff for any API write operation.

```javascript
async function withRetry(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = Math.pow(2, attempt) * 500; // 1s, 2s
      console.log(`[retry] attempt ${attempt} failed, retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

## GitHub API Rules

### Use the Git Data API for backdated commits
The high-level Repos API does NOT support custom timestamps.
Always use the low-level Git Data API sequence:
1. `GET /repos/{owner}/{repo}/git/ref/heads/{branch}` — get current HEAD SHA
2. `GET /repos/{owner}/{repo}/git/commits/{sha}` — get current tree SHA
3. `POST /repos/{owner}/{repo}/git/blobs` — create blob for new content
4. `POST /repos/{owner}/{repo}/git/trees` — create new tree
5. `POST /repos/{owner}/{repo}/git/commits` — create commit with custom `author.date`
6. `PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}` — advance the branch ref

Skipping any step produces commits that either have wrong timestamps or break the tree.

### Rate limit awareness
Check `x-ratelimit-remaining` on responses. If below 20, log a warning.
Never make more than 6 API calls per commit (the sequence above is exactly 6).

### Token from environment only
```javascript
// GOOD
const octokit = new Octokit({ auth: process.env.FARM_TOKEN });

// NEVER — hardcoded token, even fake
const octokit = new Octokit({ auth: 'ghp_...' });
```

## State Management Rules

### Write state last, after all commits succeed
If the run fails partway through, state should reflect the last successful state.
Never update `currentStreakDays` or `lastCommitDate` until commits are confirmed pushed.

### Validate state on read
State file may be missing (first run) or corrupt (crashed write).
Always provide safe defaults:
```javascript
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {
      lastCommitDate: null,
      currentStreakDays: 0,
      currentDrySpellDays: 0,
      totalCommits: 0,
      openIssues: []
    };
  }
}
```

### Atomic state writes
Write to a temp file, then rename. Prevents half-written state on crash.
```javascript
function writeState(data) {
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}
```

## CLI Flag Handling

Parse flags once at startup, pass as config — never re-read `process.argv` deep in the call stack.

```javascript
const flags = {
  dryRun: process.argv.includes('--dry-run'),
  force: process.argv.includes('--force'),
};
```

In dry-run mode, log what would happen with a clear prefix:
```javascript
if (flags.dryRun) {
  console.log('[dry-run] would commit:', message, 'at', timestamp);
  return;
}
```

## Logging Standards

Every meaningful event gets a bracketed prefix so GitHub Actions logs are scannable:

```
[commit-farmer] starting run — profile: medium, dry-run: false
[scheduler] streak: 3 days, dry spell: 0 days
[scheduler] day weight (Wednesday): 1.0 — rolled 0.72 — committing
[scheduler] session size: 3 commits
[committer] commit 1/3 — updating 2026-04.md at 09:12
[committer] commit 2/3 — updating 2026-04.md at 09:34
[committer] commit 3/3 — updating 2026-04.md at 10:08
[state] wrote updated state — streak now 4, total commits 51
[commit-farmer] run complete
```

Never use `console.log` without a prefix in production paths.

## Module Boundaries

Each module owns exactly one concern. Never reach across:

| Module | Owns | Does NOT own |
|--------|------|--------------|
| `scheduler.js` | timing decisions, state r/w | GitHub API calls, file content |
| `committer.js` | git operations | scheduling decisions, issue management |
| `github-api.js` | issues/PRs | commit creation (that's committer.js) |
| `messages.js` | commit message generation | nothing else |
| `patterns.js` | timestamp/session math | state, API, file selection |
| `index.js` | orchestration only | business logic |

If a function in `committer.js` needs to know about dry-spell logic, something is wrong — that decision should have already been made by `scheduler.js`.

## Debugging Checklist

Run silently exits with no commits:
- Check `shouldCommitToday()` return value and log the roll result
- Check `FARM_TOKEN` is set in env (`process.env.FARM_TOKEN`)
- Check `flags.dryRun` — dry-run runs never push

Commits pushed but wrong timestamp:
- Verify using Git Data API, not Repos API
- Confirm `author.date` and `committer.date` are both set (not just one)
- ISO 8601 format: `2026-04-16T09:12:00Z`

State grows stale (streak miscounted):
- Confirm `writeState` is called after all commits succeed, not before
- Confirm `readState` handles missing file gracefully
- Check date comparison uses UTC, not local time (GitHub Actions runs in UTC)
