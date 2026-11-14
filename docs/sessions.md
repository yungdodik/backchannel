# Running the two long-running sessions

Repo: https://github.com/yungdodik/backchannel (private). Coordination happens only through GitHub (PRs, issues, CI) — the sessions may run on different machines.

| Session | Machine | Folder | Branch |
|---|---|---|---|
| A (data) | laptop 1 | `junction/backchannel-a` (worktree) | `a/pipeline` + `a/<milestone>` |
| B (UI) | laptop 2 | fresh clone | `b/ui` + `b/<milestone>` |

## Laptop 2 setup (session B)
1. Install Node 22+, git, GitHub CLI (`winget install GitHub.cli` / `brew install gh`), Claude Code.
2. `gh auth login` — same GitHub account, or add the second person as collaborator on the repo; then `gh auth refresh -s workflow`.
3. `gh repo clone yungdodik/backchannel && cd backchannel && git switch b/ui && npm ci`
4. Create `.env.local` with `CALA_API_KEY`, `EXA_API_KEY`, `GEMINI_API_KEY` — transfer the values by a private channel (password manager / in person), **never via git, issues or chat logs**.
5. `git config user.name …; git config user.email …`
6. Start `claude` in the clone; allow git, gh, npm, npx, node, curl (or `/fewer-permission-prompts`); paste prompt B.

## Prompts (one line each)

**A**
```
/loop /mattpocock-skills:implement docs/spec.md Part A. Each round: (1) git fetch; gh issue list --label for-A --state open, answer or act; (2) gh pr list + git log origin/main to see which A-milestones are merged, pick the next unmerged one (A0 first, B is waiting on it); (3) git pull --rebase origin main, implement it on a fresh branch a/<milestone> via /tdd at the spec's seams, delegate [sonnet] tasks to sonnet subagents and validate them; (4) open a PR "A<n>: …", wait for CI, merge it yourself (squash) when green; (5) if blocked by B open a for-B issue and move on. Stop the loop when A0–A8 are merged and check:pipeline passes; then run /code-review against the spec.
```

**B**
```
/loop /mattpocock-skills:implement docs/spec.md Part B. Each round: (1) git fetch; gh issue list --label for-B --state open, answer or act; (2) gh pr list + git log origin/main to see which B-milestones are merged, pick the next unmerged one; B0 needs A0 merged first (until then do B1 against a local fake stream); (3) git pull --rebase origin main, implement it on a fresh branch b/<milestone> via /tdd at the spec's seams, delegate [sonnet] tasks to sonnet subagents and validate them; (4) open a PR "B<n>: …", wait for CI, merge it yourself (squash) when green; (5) if blocked by A open a for-A issue and move on. Stop the loop when B0–B5 are merged; then run /code-review against the spec.
```

## Notes
- Both laptops need the `mattpocock-skills` plugin installed in Claude Code (`/plugin` → claude-plugins-official → mattpocock-skills), else `/mattpocock-skills:implement`, `/tdd`, `/code-review` don't exist.
- `/implement` can't be auto-invoked by the model, so it is the loop's slash command; `/tdd`, `/code-review` are model-invocable.
- Unattended runs stall on permission prompts; allowlist first.
- If a key changes, update `.env.local` on both machines by hand.
