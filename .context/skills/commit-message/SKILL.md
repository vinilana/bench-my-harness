---
type: skill
name: Commit Message
description: Write commit messages for BMH following the Conventional Commits style used in this repo's history. Use when creating a commit for staged changes.
skillSlug: commit-message
phases: [E, C]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---
## Workflow

1. Inspect what is staged: `git diff --staged`. Group the change by intent, not by file.
2. Pick the type from the set this repo actually uses (see `git log`): `feat`, `fix`, `chore`, `docs`, `refactor`. Past commits: `feat: add interactive spec creation and corresponding tests`, `fix: clarify problem statement...`, `chore: update version to 0.4.0...`, `docs: specify provider transcript usage evidence`, `Refactor CLI commands and improve internal hook handling`.
3. Write the subject as `type: imperative summary`, lower-case after the colon, no trailing period, kept short (~72 chars). A scope is optional and rarely used in this history — omit it unless it adds real clarity.
4. Add a body only when the change needs the "why": link the spec or ADR it implements (e.g. "implements spec 24 CLI consolidation", "per ADR-013"), and note any acceptance-gate impact. Most small commits here have no body.
5. CONTRIBUTING.md defines no required trailer (no Signed-off-by / Co-authored-by mandate) and there is none in the history — do not invent one. If your environment injects a co-author trailer, that is fine, but the repo does not require it.
6. Releases follow a separate convention: a `chore: update version to X.Y.Z ...` commit plus a merged `release/X.Y.Z` branch. Do not hand-author release commits as feature work.

## Examples

```text
feat: add interactive spec creation and corresponding tests
```

```text
fix: confine claude_code hook installer writes to the trial workspace

The installer was resolving the hooks path against cwd, which could
write outside the checkout. Anchor it to the provisioned workspace root.
Closes the "hook installers only write inside the trial workspace"
acceptance gate; implements docs/specs/19.
```

```text
docs: document provider transcript identity checks (spec 22)
```

## Quality Bar

- One logical change per commit; never bundle an unrelated refactor with a feature.
- Type prefix matches reality: behavior change → `feat`/`fix`; no behavior change → `refactor`/`chore`/`docs`.
- Subject is imperative ("add", "confine", "remove"), not past tense, and not a file list.
- Reference the governing spec (`docs/specs/NN`) or ADR (`docs/adrs/0NN`) in the body when the commit implements one — this repo is spec-driven and the linkage matters.
- Do not claim a gate is satisfied in the message unless `npm test` / `npm run typecheck` actually pass for the staged state.
- No fabricated trailers; match the existing history.

## Resource Strategy

- No scripts or templates needed; `git log --oneline` is the living style guide.
- If commit conventions ever formalize (e.g. enforced scopes or a trailer), record that in CONTRIBUTING.md and update this skill to match — do not let them diverge.
