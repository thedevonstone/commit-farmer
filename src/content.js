/**
 * content.js
 *
 * Real TIL entry bank organized by topic.
 * Each entry has a heading and body (plain markdown, no surrounding ---).
 * committer.js picks from this bank when generating 'add' and 'update' commits.
 *
 * Entries are genuine developer knowledge — short, accurate, useful.
 * The goal is that dev-til reads like a real working developer's notes.
 */

const bank = {

  javascript: [
    {
      heading: 'Array.at() for negative indexing',
      body: `\`Array.at(-1)\` returns the last element without needing \`arr[arr.length - 1]\`.
Works on strings too.

\`\`\`js
const last = [1, 2, 3].at(-1);     // 3
const secondLast = 'hello'.at(-2); // 'l'
\`\`\``,
    },
    {
      heading: 'Optional chaining with method calls',
      body: `Optional chaining \`?.\` works on method calls, not just property access.

\`\`\`js
const len = user?.getName?.().length;
\`\`\`

If \`user\` is null or \`getName\` doesn't exist, returns \`undefined\` instead of throwing.`,
    },
    {
      heading: 'Nullish coalescing vs OR operator',
      body: `\`??\` only falls back on \`null\` or \`undefined\`. \`||\` falls back on any falsy value.

\`\`\`js
const count = userCount ?? 0; // keeps 0 if userCount is 0
const count = userCount || 0; // replaces 0 with 0 — but also replaces false, ''
\`\`\`

Use \`??\` when 0 or empty string are valid values.`,
    },
    {
      heading: 'Promise.allSettled vs Promise.all',
      body: `\`Promise.all\` rejects as soon as any promise rejects — all-or-nothing.
\`Promise.allSettled\` waits for every promise and returns all results including failures.

\`\`\`js
const results = await Promise.allSettled([fetchA(), fetchB(), fetchC()]);
results.forEach(r => {
  if (r.status === 'fulfilled') use(r.value);
  else log(r.reason);
});
\`\`\`

Use \`allSettled\` when you want partial results.`,
    },
    {
      heading: 'structuredClone for deep copy',
      body: `\`structuredClone()\` is now the standard way to deep-clone an object. No more JSON parse/stringify hack.

\`\`\`js
const copy = structuredClone(original);
\`\`\`

Handles dates, maps, sets, and circular references correctly. JSON.parse/stringify drops undefined values and breaks Date objects.`,
    },
    {
      heading: 'Object.groupBy',
      body: `\`Object.groupBy\` groups an array into an object by a key function. No more manual reduce.

\`\`\`js
const byStatus = Object.groupBy(tasks, t => t.status);
// { todo: [...], done: [...], blocked: [...] }
\`\`\`

Available in Node 21+ and modern browsers. Use \`Map.groupBy\` if you need non-string keys.`,
    },
    {
      heading: 'Logical assignment operators',
      body: `Three operators that combine logical check with assignment.

\`\`\`js
a ||= b;  // a = a || b — assign if a is falsy
a &&= b;  // a = a && b — assign if a is truthy
a ??= b;  // a = a ?? b — assign if a is null/undefined
\`\`\`

Useful for setting defaults: \`options.timeout ??= 5000\``,
    },
    {
      heading: 'AbortController for cancelling fetch',
      body: `Cancel in-flight requests with \`AbortController\`. Useful for search-as-you-type.

\`\`\`js
let controller = new AbortController();

async function search(query) {
  controller.abort();
  controller = new AbortController();
  const res = await fetch(\`/api?q=\${query}\`, { signal: controller.signal });
  return res.json();
}
\`\`\`

The aborted fetch throws an \`AbortError\` — catch it separately if needed.`,
    },
    {
      heading: 'Error.cause for chained errors',
      body: `Pass \`{ cause }\` to Error to chain the original error without losing the stack trace.

\`\`\`js
try {
  await db.query(sql);
} catch (err) {
  throw new Error('Failed to load user', { cause: err });
}
\`\`\`

Access with \`error.cause\`. Better than appending the message string manually.`,
    },
    {
      heading: 'Array.findLast and findLastIndex',
      body: `Searches from the end of the array instead of the beginning.

\`\`\`js
const lastFailed = results.findLast(r => r.status === 'error');
const lastIdx    = results.findLastIndex(r => r.status === 'error');
\`\`\`

Cleaner than reversing the array and calling \`find\`.`,
    },
    {
      heading: 'queueMicrotask for async without promises',
      body: `\`queueMicrotask\` schedules a callback in the microtask queue — runs before the next task but after the current synchronous code.

\`\`\`js
queueMicrotask(() => {
  // runs before setTimeout, after current call stack
  processQueue();
});
\`\`\`

Useful when you need to defer work without the overhead of a full Promise.`,
    },
    {
      heading: 'Object.entries iteration pattern',
      body: `Cleanest way to iterate over an object's key-value pairs.

\`\`\`js
for (const [key, value] of Object.entries(config)) {
  console.log(key, value);
}

// Or transform into a new object
const doubled = Object.fromEntries(
  Object.entries(prices).map(([k, v]) => [k, v * 2])
);
\`\`\``,
    },
    {
      heading: 'String.replaceAll',
      body: `\`String.replaceAll\` replaces every match without needing a regex with the \`g\` flag.

\`\`\`js
// Before
str.replace(/foo/g, 'bar');

// After
str.replaceAll('foo', 'bar');
\`\`\`

Still accepts a regex if you need it, but the string version is cleaner for literal replacements.`,
    },
    {
      heading: 'Temporal dead zone',
      body: `\`let\` and \`const\` are hoisted but not initialized — accessing them before declaration throws a ReferenceError. This is the temporal dead zone.

\`\`\`js
console.log(x); // ReferenceError
let x = 5;
\`\`\`

\`var\` would return \`undefined\` instead. The TDZ is intentional — it catches a real class of bugs.`,
    },
    {
      heading: 'Performance.now for precise timing',
      body: `\`performance.now()\` returns a high-resolution timestamp in milliseconds, more precise than \`Date.now()\`.

\`\`\`js
const start = performance.now();
doWork();
const elapsed = performance.now() - start;
console.log(\`took \${elapsed.toFixed(2)}ms\`);
\`\`\`

Works in both Node.js and browsers. Use \`performance.mark\` and \`performance.measure\` for more structured profiling.`,
    },
    {
      heading: 'Array spread vs Array.from',
      body: `Both convert iterables to arrays, but \`Array.from\` takes an optional map function.

\`\`\`js
// spread
const arr = [...nodeList];

// Array.from with map — one step instead of two
const values = Array.from(nodeList, node => node.textContent);
\`\`\`

\`Array.from\` also works on array-like objects (e.g. \`arguments\`) that spread doesn't handle.`,
    },
  ],

  git: [
    {
      heading: 'git stash with a descriptive name',
      body: `Named stashes are much easier to manage than the default \`stash@{0}\` naming.

\`\`\`bash
git stash push -m "wip: auth refactor"
git stash list
# stash@{0}: On main: wip: auth refactor
git stash pop stash@{0}
\`\`\``,
    },
    {
      heading: 'git bisect to find a regression',
      body: `Binary search through commits to find where a bug was introduced.

\`\`\`bash
git bisect start
git bisect bad              # current commit is broken
git bisect good v1.2.0      # this tag was working

# git checks out the midpoint — test it, then:
git bisect good  # or: git bisect bad
# repeat until git identifies the first bad commit
git bisect reset
\`\`\``,
    },
    {
      heading: 'git worktree for parallel branches',
      body: `Check out multiple branches simultaneously into separate directories — no stashing needed.

\`\`\`bash
git worktree add ../project-hotfix hotfix/login-bug
cd ../project-hotfix
# work on the hotfix without touching your main working tree
git worktree remove ../project-hotfix
\`\`\``,
    },
    {
      heading: 'git log graph view',
      body: `A compact visual of branch history directly in the terminal.

\`\`\`bash
git log --oneline --graph --all --decorate
\`\`\`

Worth aliasing: \`git config --global alias.lg "log --oneline --graph --all --decorate"\``,
    },
    {
      heading: 'git commit --fixup with autosquash',
      body: `When you spot a bug in an earlier commit on your branch, fixup keeps history clean.

\`\`\`bash
git commit --fixup=abc1234     # creates a fixup! commit
git rebase -i --autosquash origin/main  # automatically squashes it in
\`\`\`

The fixup commit gets sorted and merged into the right place automatically.`,
    },
    {
      heading: 'git log -S to search for changes',
      body: `Find the commit that added or removed a specific string — useful for tracking down when something changed.

\`\`\`bash
git log -S "functionName" --oneline
git log -S "API_KEY" --all  # search across all branches
\`\`\`

Different from \`git grep\` which searches the current state — \`-S\` searches history.`,
    },
    {
      heading: 'git diff --word-diff',
      body: `Shows changes within a line instead of the whole line. Much easier to read for prose or long strings.

\`\`\`bash
git diff --word-diff
\`\`\`

Outputs: \`[-old word-]{+new word+}\` inline. Use \`--word-diff=color\` for colored output.`,
    },
    {
      heading: 'git switch and git restore',
      body: `\`git checkout\` does too many things. The newer commands are clearer.

\`\`\`bash
git switch branch-name          # switch branches (was: git checkout branch-name)
git switch -c new-branch        # create and switch (was: git checkout -b)
git restore file.txt            # discard changes (was: git checkout -- file.txt)
git restore --staged file.txt   # unstage (was: git reset HEAD file.txt)
\`\`\``,
    },
    {
      heading: 'git shortlog for contribution summary',
      body: `Summarizes commits by author — useful for changelogs or seeing who worked on what.

\`\`\`bash
git shortlog -sn           # count commits per author, sorted
git shortlog -sn v1.0..HEAD  # since a tag
\`\`\``,
    },
    {
      heading: 'git blame with line range',
      body: `Narrow blame to specific lines instead of the whole file.

\`\`\`bash
git blame -L 45,60 src/auth.js
git blame -L '/function login/,+20' src/auth.js  # regex range
\`\`\`

Add \`-w\` to ignore whitespace changes so reformatting doesn't obscure the real author.`,
    },
    {
      heading: 'git rerere — reuse recorded resolution',
      body: `Remembers how you resolved a merge conflict so it can apply the same fix automatically next time.

\`\`\`bash
git config --global rerere.enabled true
\`\`\`

Useful on long-lived feature branches that regularly rebase onto main.`,
    },
    {
      heading: 'git sparse-checkout for large repos',
      body: `Only check out the parts of a repo you actually need.

\`\`\`bash
git clone --filter=blob:none --sparse https://github.com/org/repo
git sparse-checkout set src/module-i-need docs
\`\`\`

Saves significant disk space and clone time in monorepos.`,
    },
    {
      heading: 'git tag for releases',
      body: `Annotated tags store extra metadata (tagger, date, message) and are the right choice for releases.

\`\`\`bash
git tag -a v1.2.0 -m "Release 1.2.0"
git push origin v1.2.0
git push origin --tags  # push all tags
\`\`\`

Lightweight tags (no \`-a\`) are just pointers — fine for local bookmarks, not releases.`,
    },
    {
      heading: 'git config aliases worth setting',
      body: `A few aliases that save keystrokes every day.

\`\`\`bash
git config --global alias.st   "status -s"
git config --global alias.co   "checkout"
git config --global alias.br   "branch -a"
git config --global alias.lg   "log --oneline --graph --decorate --all"
git config --global alias.undo "reset HEAD~1 --mixed"
\`\`\``,
    },
    {
      heading: 'git cherry-pick a single commit',
      body: `Apply a specific commit from another branch without merging the whole branch.

\`\`\`bash
git cherry-pick abc1234
\`\`\`

Use \`-n\` (no commit) to apply the changes without committing, so you can edit before committing.
Use \`-x\` to append the source commit SHA to the commit message.`,
    },
  ],

  css: [
    {
      heading: ':has() — the parent selector',
      body: `\`:has()\` selects an element based on what it contains. Finally a parent selector in CSS.

\`\`\`css
/* card that contains an image gets less padding */
.card:has(img) { padding: 0; }

/* label before a required input */
label:has(+ input:required)::after { content: ' *'; }
\`\`\`

Wide browser support as of 2023.`,
    },
    {
      heading: 'CSS container queries',
      body: `Style an element based on its container's size, not the viewport. More useful than media queries for components.

\`\`\`css
.card-wrapper {
  container-type: inline-size;
}
@container (min-width: 400px) {
  .card { flex-direction: row; }
}
\`\`\`

The component adapts wherever it's placed, regardless of viewport.`,
    },
    {
      heading: 'clamp() for fluid typography',
      body: `\`clamp(min, preferred, max)\` scales a value between two bounds based on viewport width.

\`\`\`css
font-size: clamp(1rem, 2.5vw, 2rem);
\`\`\`

No media query needed. Font grows with the viewport but never smaller than \`1rem\` or larger than \`2rem\`.`,
    },
    {
      heading: 'CSS nesting',
      body: `Native CSS nesting is now supported without a preprocessor.

\`\`\`css
.card {
  padding: 1rem;

  & h2 {
    font-size: 1.25rem;
  }

  &:hover {
    background: var(--hover-bg);
  }
}
\`\`\`

The \`&\` is required (unlike Sass). Supported in all modern browsers.`,
    },
    {
      heading: '@layer for cascade management',
      body: `\`@layer\` lets you explicitly control the cascade order of your styles.

\`\`\`css
@layer reset, base, components, utilities;

@layer base {
  a { color: blue; }
}
@layer utilities {
  .text-red { color: red; } /* wins over base */
}
\`\`\`

Layers declared later win over earlier ones. Unlayered styles win over everything.`,
    },
    {
      heading: 'scroll-snap for carousels',
      body: `Native scroll snapping — no JavaScript needed for basic carousels or page sections.

\`\`\`css
.container {
  overflow-x: scroll;
  scroll-snap-type: x mandatory;
}
.item {
  scroll-snap-align: start;
  flex: 0 0 100%;
}
\`\`\`

\`mandatory\` always snaps to a point. \`proximity\` only snaps if close enough.`,
    },
    {
      heading: 'logical properties for i18n',
      body: `Logical properties use flow-relative directions instead of physical ones. Better for right-to-left layouts.

\`\`\`css
/* Physical (avoid) */
margin-left: 1rem;
padding-right: 1rem;

/* Logical (prefer) */
margin-inline-start: 1rem;
padding-inline-end: 1rem;
\`\`\`

\`inline\` = horizontal axis, \`block\` = vertical axis. Flips automatically in RTL.`,
    },
    {
      heading: 'text-wrap: balance',
      body: `Prevents awkward single-word last lines in headings.

\`\`\`css
h1, h2, h3 {
  text-wrap: balance;
}
\`\`\`

Browser redistributes line breaks so all lines are roughly equal length. Only applies up to ~6 lines for performance reasons.`,
    },
    {
      heading: 'color-mix()',
      body: `Mix two colors in CSS without a preprocessor.

\`\`\`css
background: color-mix(in srgb, #3b82f6 30%, white);
border-color: color-mix(in oklch, var(--brand) 80%, black);
\`\`\`

\`oklch\` color space produces more perceptually uniform mixes — better than \`srgb\` for gradients.`,
    },
    {
      heading: 'gap in flexbox',
      body: `\`gap\` works in flexbox now, not just grid. No more margin hacks.

\`\`\`css
.nav {
  display: flex;
  gap: 1rem;      /* space between items */
  row-gap: 0.5rem; /* different row/column gaps */
}
\`\`\`

Cleaner than \`margin-right\` on every child, which required removing margin on the last item.`,
    },
    {
      heading: ':is() and :where() for selector lists',
      body: `Both match against a list of selectors. The difference is specificity.

\`\`\`css
/* :is() takes the highest specificity of its arguments */
:is(h1, h2, h3) { line-height: 1.2; }

/* :where() always has zero specificity — easy to override */
:where(h1, h2, h3) { line-height: 1.2; }
\`\`\`

Use \`:where()\` in resets and base styles so they never win specificity battles.`,
    },
    {
      heading: 'content-visibility: auto',
      body: `Tells the browser to skip rendering off-screen content. Big performance win for long pages.

\`\`\`css
.section {
  content-visibility: auto;
  contain-intrinsic-size: 0 500px; /* estimated height to prevent scroll jump */
}
\`\`\`

The browser renders sections as they scroll into view. Reduces initial render time significantly on content-heavy pages.`,
    },
    {
      heading: 'aspect-ratio',
      body: `The \`aspect-ratio\` property replaces the old padding-top percentage hack.

\`\`\`css
/* Old hack */
.video-wrapper { padding-top: 56.25%; position: relative; }

/* Modern */
.video-wrapper { aspect-ratio: 16 / 9; }
.square { aspect-ratio: 1; }
\`\`\``,
    },
    {
      heading: 'overscroll-behavior',
      body: `Controls what happens when you scroll to the edge of an element.

\`\`\`css
/* Prevent the page from scrolling when a modal's content hits the bottom */
.modal-body {
  overflow-y: auto;
  overscroll-behavior: contain;
}
\`\`\`

\`contain\` stops scroll chaining. \`none\` also disables the pull-to-refresh bounce effect.`,
    },
    {
      heading: '@starting-style for entry animations',
      body: `Animate elements from their initial state when they first appear in the DOM — no JavaScript needed.

\`\`\`css
.dialog {
  transition: opacity 0.3s, transform 0.3s;
  opacity: 1;
  transform: translateY(0);
}
@starting-style {
  .dialog {
    opacity: 0;
    transform: translateY(8px);
  }
}
\`\`\`

Works for elements entering via \`display: none → block\` transitions too.`,
    },
  ],

  terminal: [
    {
      heading: 'fzf — fuzzy finder for everything',
      body: `\`fzf\` is a command-line fuzzy finder that integrates with almost everything.

\`\`\`bash
# Interactive file selection
vim $(fzf)

# Fuzzy search through history (Ctrl+R replacement)
history | fzf

# Kill a process interactively
kill $(ps aux | fzf | awk '{print $2}')
\`\`\`

Install: \`brew install fzf\` then run \`$(brew --prefix)/opt/fzf/install\` for shell integration.`,
    },
    {
      heading: 'tmux for persistent sessions',
      body: `tmux keeps processes running after you disconnect. Essential for remote work.

\`\`\`bash
tmux new -s work        # new named session
tmux attach -t work     # reattach
Ctrl+b d                # detach (session keeps running)
Ctrl+b c                # new window
Ctrl+b "               # split pane horizontal
Ctrl+b %               # split pane vertical
\`\`\``,
    },
    {
      heading: 'set -euo pipefail in scripts',
      body: `Put this at the top of every bash script.

\`\`\`bash
#!/bin/bash
set -euo pipefail
\`\`\`

- \`-e\`: exit immediately on error
- \`-u\`: treat unset variables as errors
- \`-o pipefail\`: pipe fails if any command in the pipe fails

Without this, a script can silently continue after failures.`,
    },
    {
      heading: 'jq for JSON on the command line',
      body: `\`jq\` is a lightweight JSON processor — essential for working with APIs in the terminal.

\`\`\`bash
curl -s https://api.example.com/users | jq '.[0].name'
curl -s api | jq '.items[] | select(.status == "active") | .id'
cat data.json | jq 'keys'
\`\`\`

\`jq .\` pretty-prints JSON. Install: \`brew install jq\``,
    },
    {
      heading: 'tee — write to file and stdout simultaneously',
      body: `\`tee\` splits output — writes to a file AND passes it through to the next command.

\`\`\`bash
./build.sh | tee build.log          # log while watching live
make test | tee results.txt | grep FAIL  # save all, filter view
\`\`\`

Useful when you want to save output but also see it in real time.`,
    },
    {
      heading: 'watch — repeat a command on an interval',
      body: `Runs a command every N seconds and shows the output full-screen.

\`\`\`bash
watch -n 2 'kubectl get pods'          # refresh every 2 seconds
watch -n 1 -d 'cat /proc/loadavg'     # highlight changes with -d
\`\`\`

Cleaner than a loop with sleep for monitoring changing state.`,
    },
    {
      heading: 'trap for cleanup in bash scripts',
      body: `\`trap\` runs a command when the script exits — useful for cleanup.

\`\`\`bash
TMP=$(mktemp)
trap "rm -f $TMP" EXIT   # always delete temp file on exit

# Runs even if the script errors or is killed with Ctrl+C
\`\`\`

\`trap CMD EXIT\` is the most useful. Also useful: \`INT\` (Ctrl+C), \`ERR\` (any error).`,
    },
    {
      heading: 'ripgrep — faster grep with better defaults',
      body: `\`rg\` is faster than grep and ignores \`.gitignore\` files by default.

\`\`\`bash
rg "functionName"              # search recursively from current dir
rg "TODO" --type js            # only .js files
rg -l "pattern"                # list files with matches, not lines
rg "old" --replace "new" -l    # preview files that would change
\`\`\`

Install: \`brew install ripgrep\``,
    },
    {
      heading: 'ssh config file',
      body: `Put connection settings in \`~/.ssh/config\` instead of typing them every time.

\`\`\`
Host staging
  HostName 192.168.1.10
  User deploy
  IdentityFile ~/.ssh/id_staging
  ForwardAgent yes

Host *.internal
  User admin
  ProxyJump bastion
\`\`\`

Then just: \`ssh staging\``,
    },
    {
      heading: 'direnv for per-directory environment variables',
      body: `\`direnv\` loads environment variables from a \`.envrc\` file when you \`cd\` into a directory.

\`\`\`bash
# .envrc
export DATABASE_URL=postgres://localhost/myapp_dev
export API_KEY=dev-key-here

# activate
direnv allow
\`\`\`

Automatically unloads when you leave the directory. No more manually sourcing \`.env\` files. Install: \`brew install direnv\``,
    },
    {
      heading: 'Process substitution',
      body: `Use the output of a command as if it were a file — without a temp file.

\`\`\`bash
diff <(sort file1.txt) <(sort file2.txt)
comm <(git ls-files) <(find . -name "*.js" | sed 's|./||')
\`\`\`

\`<(command)\` creates a virtual file descriptor. Works anywhere a filename is expected.`,
    },
    {
      heading: 'rsync for reliable file transfer',
      body: `\`rsync\` is better than \`cp\` for large or repeated transfers — only copies what changed.

\`\`\`bash
rsync -avz src/ user@host:/dest/         # sync to remote, verbose, compressed
rsync -avz --delete src/ dest/           # mirror (deletes files in dest not in src)
rsync -avzn src/ dest/                   # dry run (-n) to preview changes
\`\`\``,
    },
    {
      heading: 'fd — a better find',
      body: `\`fd\` is simpler and faster than \`find\` with sane defaults.

\`\`\`bash
fd "\.test\.js$"             # find test files
fd -t f -e md               # files with .md extension
fd -H "\.env"               # include hidden files
fd --changed-within 1d       # modified in the last day
\`\`\`

Respects \`.gitignore\`, case-insensitive by default. Install: \`brew install fd\``,
    },
    {
      heading: 'nohup and disown to keep processes running',
      body: `Run a process that survives after you log out.

\`\`\`bash
nohup ./long-script.sh &      # immune to hangup signal, output to nohup.out
disown %1                     # detach a running background job from the shell
\`\`\`

\`nohup\` is set before the process starts. \`disown\` works on already-running jobs.`,
    },
    {
      heading: 'here-documents for multiline input',
      body: `Pass multiline text to a command without a temp file.

\`\`\`bash
cat <<EOF > config.json
{
  "env": "production",
  "debug": false
}
EOF

psql mydb <<SQL
  SELECT * FROM users WHERE created_at > NOW() - INTERVAL '1 day';
SQL
\`\`\``,
    },
  ],

  misc: [
    {
      heading: 'Idempotency in APIs',
      body: `An idempotent operation produces the same result no matter how many times you call it.

GET, PUT, DELETE are idempotent. POST generally isn't.

For POST endpoints that should be idempotent (e.g. payments), use an idempotency key — a client-generated UUID sent in a header. The server stores it and returns the cached result if it sees the same key again.`,
    },
    {
      heading: 'Database indexes — when to add them',
      body: `Add an index when you regularly query a column in WHERE, JOIN ON, or ORDER BY.

\`\`\`sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at);
\`\`\`

Indexes speed reads but slow writes. Don't index every column — only what you actually query.
Foreign key columns should almost always be indexed.`,
    },
    {
      heading: 'JWT structure',
      body: `A JWT is three base64url-encoded parts separated by dots: \`header.payload.signature\`

\`\`\`
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMifQ.abc123
      header              payload           signature
\`\`\`

The signature verifies the token wasn't tampered with, but the payload is readable by anyone.
Never put sensitive data in the payload. JWTs are signed, not encrypted.`,
    },
    {
      heading: 'SSH key types — use ed25519',
      body: `ed25519 is the current best choice for SSH keys. Smaller, faster, and more secure than RSA-4096.

\`\`\`bash
ssh-keygen -t ed25519 -C "your@email.com"
\`\`\`

RSA is still fine if you need compatibility with old systems that don't support ed25519.
Never use DSA or ECDSA — DSA is deprecated, ECDSA has implementation pitfalls.`,
    },
    {
      heading: 'CORS — how it actually works',
      body: `CORS is enforced by the browser, not the server. A server without CORS headers doesn't block the request — the browser blocks the response.

For simple GET/POST requests, the browser sends the request and checks the response headers.
For requests with custom headers or non-simple methods, the browser sends a preflight OPTIONS request first.

The server controls which origins, methods, and headers are allowed via response headers.`,
    },
    {
      heading: 'Rate limiting strategies',
      body: `Common algorithms for rate limiting API endpoints:

- **Fixed window**: count requests per time window. Simple but allows burst at window boundary.
- **Sliding window**: smoother, no boundary burst problem.
- **Token bucket**: tokens refill at a fixed rate. Allows bursts up to bucket size.
- **Leaky bucket**: requests processed at a fixed rate, excess queued or dropped.

Token bucket is common for APIs. Leaky bucket for smooth outbound rate limiting.`,
    },
    {
      heading: 'Webhook vs polling',
      body: `**Polling**: your app asks "anything new?" on an interval. Simple to implement, wastes requests when nothing changes.

**Webhook**: the external service calls your app when something happens. More efficient, but requires a public endpoint and retry handling.

Use webhooks when the external service supports them. Use polling when you can't receive inbound calls (e.g. behind a NAT) or the event frequency is low and predictable.`,
    },
    {
      heading: 'DNS record types',
      body: `The ones you actually use:

- **A** — domain → IPv4 address
- **AAAA** — domain → IPv6 address
- **CNAME** — domain → another domain (can't coexist with other records at same name)
- **MX** — mail exchange server for the domain
- **TXT** — arbitrary text; used for SPF, DKIM, domain verification
- **NS** — authoritative nameservers for the domain
- **ALIAS/ANAME** — like CNAME but allowed at root domain (Cloudflare, Route53 specific)`,
    },
    {
      heading: 'TCP vs UDP',
      body: `**TCP**: connection-oriented, guaranteed delivery, ordered. Slower due to handshake and acknowledgements.
Use for: HTTP, databases, file transfer, email.

**UDP**: connectionless, no delivery guarantee, no ordering. Faster.
Use for: video streaming, gaming, DNS, VoIP.

QUIC (HTTP/3) builds reliability on top of UDP to get the best of both — fast like UDP, reliable like TCP.`,
    },
    {
      heading: 'Content Security Policy basics',
      body: `CSP is an HTTP header that tells browsers which sources are allowed to load scripts, styles, images, etc.

\`\`\`
Content-Security-Policy: default-src 'self'; script-src 'self' cdn.example.com; img-src *
\`\`\`

Blocks XSS by preventing injected scripts from running.
Start with \`Content-Security-Policy-Report-Only\` to see violations without blocking anything.`,
    },
    {
      heading: 'Docker layer caching',
      body: `Docker caches each layer and reuses it if nothing above it changed. Order matters.

\`\`\`dockerfile
# Bad — npm install re-runs on every code change
COPY . .
RUN npm install

# Good — npm install only re-runs when package.json changes
COPY package*.json ./
RUN npm install
COPY . .
\`\`\`

Put things that change least often at the top.`,
    },
    {
      heading: 'Regex lookahead and lookbehind',
      body: `Match a pattern only if it's followed or preceded by another pattern, without including it in the match.

\`\`\`js
// Positive lookahead: match "foo" only if followed by "bar"
/foo(?=bar)/.test('foobar') // true — matches "foo"

// Negative lookahead: match "foo" not followed by "bar"
/foo(?!bar)/.test('foobaz') // true

// Lookbehind
/(?<=\$)\d+/.exec('$100') // ["100"] — number after dollar sign
\`\`\``,
    },
    {
      heading: 'Database transactions',
      body: `A transaction groups operations so they either all succeed or all fail — no partial state.

\`\`\`sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
-- If anything fails: ROLLBACK
\`\`\`

ACID properties: Atomicity, Consistency, Isolation, Durability.
Always use transactions for multi-step operations that must stay consistent.`,
    },
    {
      heading: 'Environment variables — naming conventions',
      body: `A few conventions that prevent common mistakes:

- ALL_CAPS_SNAKE_CASE for env vars
- Prefix app-specific vars with your app name in shared environments: \`MYAPP_DATABASE_URL\`
- \`_URL\`, \`_KEY\`, \`_SECRET\`, \`_TOKEN\` suffixes indicate the type
- Never commit \`.env\` — always commit \`.env.example\` with fake values
- \`PUBLIC_\` or \`NEXT_PUBLIC_\` prefix for anything safe to expose to the client`,
    },
    {
      heading: 'Cron expression cheat sheet',
      body: `\`\`\`
┌──────── minute (0-59)
│ ┌────── hour (0-23)
│ │ ┌──── day of month (1-31)
│ │ │ ┌── month (1-12)
│ │ │ │ ┌ day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *

0 9 * * 1-5    every weekday at 9am
*/15 * * * *   every 15 minutes
0 0 1 * *      first day of every month at midnight
0 2 * * 0      every Sunday at 2am
\`\`\``,
    },
  ],

};

/**
 * Returns a random entry from the bank for the given topic.
 * Falls back to 'misc' if the topic isn't found.
 */
function getEntry(topic) {
  const pool = bank[topic] || bank.misc;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Formats an entry as a markdown section ready to append to a file.
 */
function formatEntry(entry) {
  return `\n\n---\n\n## ${entry.heading}\n\n${entry.body}\n`;
}

module.exports = { getEntry, formatEntry };
