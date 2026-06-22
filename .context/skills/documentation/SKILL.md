---
type: skill
name: Documentation
description: Write and update BMH docs (README, docs/specs, docs/adrs, command reference) so they match executable behavior. Use when documenting a feature, a CLI command, or an architectural decision.
skillSlug: documentation
phases: [P, C]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---
## Workflow

1. Find the right home for the doc:
   - **User-facing usage / commands** → `README.md` (Usage and Command Reference sections, all examples use the `bmh` binary).
   - **A scoped feature or behavior contract** → a numbered spec in `docs/specs/` (next number in sequence; current highest is `25-interactive-ux-overhaul.md`).
   - **An architecturally significant decision** → a numbered ADR in `docs/adrs/` (current highest is `015`). CONTRIBUTING requires adding/updating an ADR for significant architecture changes.
   - **Reusable agent prompts** → `docs/prompts/`.
2. Document only what the code does. README examples and documented flows must match executable behavior — this is an acceptance gate and is partially machine-checked by `tests/acceptance/readme-gates.test.ts` (which asserts the README mentions Codex/Claude Code only, `--harness codex`, `--harness claude_code`, best-effort vs strict telemetry, Roadmap Scope, etc.).
3. Keep every `bmh` example real: it must run as written, and also work as `node ./dist/adapters/inbound/cli/main.js <args>` for source builds. Verify against `runCli` behavior, not memory.
4. Preserve the established framing: v1 scope is Codex and Claude Code only; usage capture is best-effort with explicit source/confidence; unknown models stay unavailable; real-harness runs are opt-in and never part of `npm test`. Do not document roadmap items as if implemented — keep them under "Future phases".
5. When you change a documented command flag or output string, update the README, the relevant spec, and any assertion in `readme-gates.test.ts` in the same change. Run `npm test`.

## Examples

A README usage block must be copy-pasteable and match the binary:

````markdown
### Run a local dry run

```bash
bmh run --dry-run --run-id local_suite_001
```

This writes `.bmh/runs/local_suite_001/report.html`.
````

An ADR follows the existing numbered, decision-first shape (see `docs/adrs/013-observability-requires-multiple-sources.md`): context, decision, consequences. A spec (see `docs/specs/25-interactive-ux-overhaul.md`) leads with Problem → Decision and cites the file paths it changes.

## Quality Bar

- Docs describe shipped behavior, not intent. If the README and the code disagree, the README is the bug — fix one of them, never leave them divergent.
- The README's hard contracts (v1 = Codex + Claude Code, best-effort/strict telemetry, opt-in real smoke tests, JSON-only benchmark format) must remain present and accurate; `readme-gates.test.ts` will fail otherwise.
- Every metric/usage claim in docs must restate the source/confidence honesty (native > estimated, unavailable not guessed) — do not overstate what BMH measures.
- New architecture decisions get an ADR; reviewers expect one for significant changes (CONTRIBUTING).
- Examples use the published `bmh` binary name and real flags taken from the CLI, not invented options.

## Resource Strategy

- Put long, reusable agent instructions in `docs/prompts/` (as with `initialize-bmh-spec-catalog-prompt.md`) rather than inlining them in the README.
- Keep diagrams/assets under `docs/assets/`.
- Do not add separate `references/` files to this skill folder; the authoritative docs already live in `README.md`, `docs/specs/`, and `docs/adrs/`.
