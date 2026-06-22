---
type: skill
name: Pr Review
description: Review a BMH pull request against the project's acceptance gates, TDD process, and hexagonal boundaries before merge. Use when validating proposed changes on a branch or PR.
skillSlug: pr-review
phases: [R, V]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---
## Workflow

1. Establish scope: `git fetch origin && git diff origin/main...HEAD --stat`, then read the diff. Map every changed file to a layer (`domain`/`application`/`adapters`/`tests`/`docs`) and to the spec or ADR it claims to implement.
2. Verify the gates locally before reading further — a PR that does not pass them is not mergeable:
   - `npm run typecheck`
   - `npm test` (must be green; must not have called real Codex/Claude)
   - `npm run build`
3. Confirm TDD: production changes are accompanied by tests under `tests/acceptance/` that assert the new behavior. New schema fields need reject-invalid tests. New CLI behavior needs a `runCli` test. New interactive flow needs a `ScriptedPrompter`/scripted-stdin test, never a real TTY.
4. Walk the acceptance gates from CONTRIBUTING against the diff: schema rejection, `raw_ref` on every normalized event, hook installers confined to the trial workspace with clean uninstall, spool fallback in `hook-capture`, per-trial install/uninstall in the runner, `measurement_source`+`capture_source`+`confidence` on every metric, comparability refusing incompatible runs, redaction before reports, README/docs matching behavior.
5. Enforce boundaries: no provider imports or `adapters/` imports in `domain`/`application`; no `node:fs|path|child_process|http` in domain or application use-cases; `@clack/prompts` only inside `clack-prompter.ts`. `tests/acceptance/architecture-boundaries.test.ts` must stay green.
6. Check the PR is releasable in shape: focused branch (the repo uses `feat/`, `fix/`, `refactor/`, `release/` branch prefixes merged via PR), Conventional-Commit history, CHANGELOG updated when the change is user-visible, and any new architecture decision captured as an ADR.

## Examples

Minimum local gate check before approving:

```bash
git diff origin/main...HEAD            # read every hunk
npm run typecheck && npm test && npm run build
npx vitest run tests/acceptance/architecture-boundaries.test.ts tests/acceptance/readme-gates.test.ts
```

A blocking review comment: "`run-spec-suite.ts` imports `CodexUsageCapture` directly — this crosses the port boundary and will fail `architecture-boundaries.test.ts`. Depend on `UsageCapturePort` and inject the collector from `main.ts`."

## Quality Bar

- All three gates (`typecheck`, `test`, `build`) green, no real-harness calls in the test path — non-negotiable for approval.
- Every acceptance gate touched by the diff is verified, not assumed.
- Schema/contract changes are backward-considered and have reject-invalid tests; report output stays redacted by default.
- Usage/pricing changes keep native > estimated, never silently mix counts, and leave unknown models unavailable.
- Docs and README updated alongside behavior changes; ADR added for significant architecture shifts.
- Commit history follows the repo's Conventional-Commit style with no fabricated trailers (see the `commit-message` skill).

## Resource Strategy

- This is the human/agent counterpart to the `/code-review` and `/review` slash commands; keep findings phrased as actionable, file-anchored comments.
- No scripts or assets; the checklist's authority is CONTRIBUTING.md's acceptance gates and the ADRs in `docs/adrs/`.
