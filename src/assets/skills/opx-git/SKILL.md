---
name: opx-git
description: Disciplined Git workflows — atomic commits with repo-matched style, safe rebase/squash, and history archaeology (blame, pickaxe, bisect). Use when committing changes, cleaning up history, or investigating when/why/by-whom code changed.
---

This skill makes Git operations disciplined and reviewable. Use it whenever you commit, reshape history, or investigate the past. It never commits, pushes, or rewrites history on its own — it acts only on an explicit request, and history-rewriting or force-push is gated behind the user's approval.

## 1. Read the repo before you act

Gather context in parallel: `git status`, `git diff`, `git diff --staged`, and `git log --oneline -30`. Detect the merge base with `git merge-base HEAD main` (fall back to `master`).

**Match the existing commit style** — infer it from the last ~30 commits, do not impose one:
- *Semantic* (`feat:`, `fix:`, `chore:` …) only if the history clearly uses it.
- *Plain* natural-language subjects if that dominates.
- *Short* 1–3 word subjects if that is the norm.
- Mirror the repo's language and capitalization conventions.

## 2. Commit atomically

Default to **multiple small commits**, not one large one. A change that spans different directories, component types, or independent concerns should be split so each commit is individually revertible and reviewable.

- Rough floor: about `ceil(files_changed / 3)` commits for a multi-file change — but cohesion wins over arithmetic.
- Keep tests with the implementation they cover; never split a test from its code.
- Order dependency-first: utilities → models → services → API/UI → config.
- If a single commit must touch many files, say in one sentence why they are one cohesive change.
- Verify each staged set with `git diff --staged --stat` before committing.

Avoid: one giant commit across unrelated files; grouping by file type instead of by feature; vague messages ("update stuff", "related changes").

## 3. Reshape history safely

- **Never rewrite history that has been pushed or shared without explicit user approval**, and **never rebase `main`/`master`**.
- Interactive squash/reorder: `git rebase -i <base>`; apply fixups with `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash`.
- Create fixups with `git commit --fixup <sha>` so autosquash can fold them.
- Resolve conflicts by editing, `git add` the resolved files, then `git rebase --continue`.
- Force-push only with `--force-with-lease`, never a bare `--force`, and only after approval.

## 4. Investigate history (archaeology)

- *When was a string added/removed?* pickaxe: `git log -S"<string>" --oneline` (use `-G"<regex>"` to match diff patterns).
- *Who wrote this line and when?* `git blame -L <start>,<end> <file>`.
- *Which commit introduced a bug?* `git bisect start` / `good` / `bad` to binary-search.
- *Full history of a file across renames?* `git log --follow -- <file>`.

## Output

When run inside a Cerebro task, fold the result into your `TASK_RESULT` (commits created, history actions taken with their approval, or findings). Respect plan approval gates for any destructive or history-rewriting action.
