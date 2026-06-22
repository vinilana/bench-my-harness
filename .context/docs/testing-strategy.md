---
type: doc
name: testing-strategy
description: Test frameworks, patterns, coverage requirements, and quality gates
category: testing
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---

## Testing Strategy

BMH practices Spec-Driven Development with TDD: acceptance tests are written against a numbered spec in [`docs/specs/`](../../docs/specs/) **before** the production implementation, and the implementation is considered complete only when the suite is green. Tests run on **Vitest** (`vitest.config.ts`), with `globals: true`, the `node` environment, `restoreMocks`/`clearMocks` enabled, and `tests/fixtures/**` excluded from collection. The full suite is large and lives almost entirely under `tests/acceptance/` (70+ specs), which exercises the system through its real ports and use cases rather than mocking internals.

A hard, non-negotiable rule: **the v1 suite must never call real Codex or Claude Code.** All harness behavior in tests is driven by fakes and process-controlled stand-ins. Real harness execution is opt-in, local-only, and explicitly excluded from `npm test` (see [development-workflow.md](./development-workflow.md) and `CONTRIBUTING.md`).

## Test Types

Test files are named `*.test.ts` and collected from `tests/**/*.test.ts`. Categories (per `CONTRIBUTING.md` and the spec plan):

- **Schema / contract**: validate Zod schemas accept valid payloads and reject invalid ones — e.g. `tests/acceptance/canonical-event-schema.test.ts`, `benchmark-schema.test.ts`, `spec-catalog-schema.test.ts`, `usage-report-schema.test.ts`.
- **Domain unit**: pure domain rules — e.g. `phase3-evaluation.test.ts`, `phase3-metrics.test.ts`, `security-redaction.test.ts`, `usage-and-comparability.test.ts`, `normalization-coverage.test.ts`.
- **Application use-case**: orchestration against ports — e.g. `benchmark-runner.test.ts`, `spec-suite-application.test.ts`, `benchmark-suite-runner.test.ts`.
- **Adapter contract**: provider adapters and capabilities — e.g. `hook-installers.test.ts`, `adapter-capabilities.test.ts`, `harness-command-profiles.test.ts`, `codex-usage-capture.test.ts`, `claude-usage-capture.test.ts`, `openai-pricing.test.ts`.
- **Integration with fake harnesses**: end-to-end runner flow using fakes / process stand-ins — e.g. `spec-suite-real-workspace.test.ts`, `benchmark-runner-git-workspace.test.ts`, `process-runner.test.ts`, `git-workspace-provisioner.test.ts`.
- **CLI behavior**: the `bmh` surface — e.g. `cli-public-surface.test.ts`, `cli-spec-suite.test.ts`, `cli-spec-import.test.ts`, `cli-consolidation-interactive.test.ts`, `cli-interactive-prompter.test.ts`, `hook-capture-cli.test.ts`, `cli-error-paths.test.ts`.
- **Architecture boundary**: `architecture-boundaries.test.ts` fails the build if core code imports provider-specific packages or crosses layers.
- **Artifact / fixture**: artifact finalization and integrity — e.g. `artifact-collection.test.ts`, `spec-suite-artifact-finalization.test.ts`, `provider-transcript-finalization.test.ts`, plus `readme-gates.test.ts` (documented flows must match behavior).

### Fixtures and fakes

- Fixtures live under `tests/fixtures/` (excluded from test collection): `benchmarks/`, `codex/` and `claude-code/` transcripts (`usage/`), `git-history/` checkouts, `spec-catalogs/`, `process-harness/`, `security/`, `artifacts/`.
- Reusable fakes live under `tests/support/fakes/`: `FakeHarnessRunner`, `FakeHookInstaller`, `FakeArtifactCollector`. Shared helpers include `tests/support/git-fixture.ts` (`createLocalGitFixture`) and `tests/support/spec19-fixtures.ts`.

### Interactive CLI testing

Interactive flows are never tested against a real terminal. The `Prompter` port (`src/adapters/inbound/cli/prompter.ts`) is the seam: production uses `ClackPrompter` (TTY, @clack/prompts), and tests use `ScriptedPrompter` (`src/adapters/inbound/cli/scripted-prompter.ts`). `ScriptedPrompter` renders the exact text a user would see (so tests can assert on prompts) and consumes a pre-supplied, ordered `answers` array — one answer per prompt. It can simulate a Ctrl+C/Esc cancel at a given prompt index via `cancelAt`, and it fails loudly when scripted input is exhausted mid-validation. This is exercised by `cli-interactive-prompter.test.ts` and `cli-consolidation-interactive.test.ts`.

## Running Tests

- All tests: `npm test` (`vitest run`)
- Watch mode: `npm run test:watch` (`vitest`)
- A single file: `npx vitest run tests/acceptance/benchmark-runner.test.ts`
- Type-check (also the lint gate): `npm run typecheck` / `npm run lint`

## Quality Gates

There is no separate coverage threshold or ESLint config; the gates are behavioral and enforced by the acceptance suite plus `tsc`:

- `npm test` passes and `npm run typecheck` reports no errors.
- Hexagonal boundaries hold (`architecture-boundaries.test.ts`).
- Canonical event schemas reject invalid payloads; every normalized event references a raw event.
- Hook installers only write inside the trial workspace; the runner installs/uninstalls hooks per trial; `hook-capture` preserves events via spool fallback.
- Usage metrics always declare source and confidence; the comparability policy refuses incompatible runs; redaction strips known secrets before reports.
- README/documented flows match executable behavior (`readme-gates.test.ts`).
- No test invokes real Codex or Claude Code.

## Troubleshooting

- Tests that provision git checkouts (`git-fixture.ts`, `*-git-workspace.test.ts`) require `git` on `PATH`.
- Process-runner and workspace tests create temporary directories and spawn child processes (Node executables under `tests/fixtures/process-harness/` / `tests/support/spec19-fixtures.ts`); a sandbox that blocks process spawning or temp writes will fail them spuriously.
- If interactive CLI tests "hang" or fail with an exhausted-input error, the `ScriptedPrompter` `answers` list is out of sync with the prompts issued — add/remove answers to match the flow order.
- Mocks are auto-restored/cleared between tests (`restoreMocks`/`clearMocks`); do not rely on mock state leaking across `it` blocks.
