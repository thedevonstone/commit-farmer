# Setting Up the Target Repository

commit-farmer commits to a separate repository. This is the repo
that shows activity on your GitHub contribution graph.

---

## Recommended approach: TIL repo

A TIL (Today I Learned) repository is the ideal farm target because:

- It is a real pattern that many developers use legitimately
- Content is expected to be short, frequent, and varied
- Commits are naturally small and regular
- A new entry per session looks completely believable

Many developers keep public TIL repos. Search GitHub for "til" to see examples.

---

## Setting up the target repo

1. Create a new public repo on GitHub
   Suggested name: `dev-til` or `til` or `notes`

2. Initialize it with a README:

```markdown
# Today I Learned

Short notes on things I learn while working.
Inspired by jbranchaud/til.

Topics: javascript, git, css, terminal, misc
```

3. Create the initial folder structure:

```
dev-til/
  README.md
  javascript/
  git/
  css/
  terminal/
  misc/
  index.md     <- running index of all entries
```

4. Add it as the TARGET_REPO secret in commit-farmer

---

## What commits look like

Each farming session adds or updates entries in this repo.
A typical commit changes a file like `javascript/2026-04.md`
by appending a short entry:

```markdown
## Array.at()

Array.at(-1) returns the last element without needing arr[arr.length - 1].
Works on strings too.
```

The commit message would be something like `add note on array methods`
or `add til entry` — drawn from the messages.js bank.

---

## Fine-grained token setup

For security, use a fine-grained personal access token scoped
only to the target repo:

1. Go to github.com/settings/tokens
2. Generate new token (fine-grained)
3. Resource owner: your account
4. Only select repositories: your target repo
5. Repository permissions: Contents = Read and Write
6. Copy the token and add it as the FARM_TOKEN secret in commit-farmer

This way the token cannot touch any other repo even if it were exposed.
