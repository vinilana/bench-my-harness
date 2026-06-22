---
type: agent
name: Test Writer
description: Write comprehensive unit and integration tests
agentType: test-writer
phases: [E, V]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---

## Available Skills

The following skills provide detailed procedures for specific tasks. Activate them when needed:

| Skill | Description |
|-------|-------------|
| [test-generation](./../skills/test-generation/SKILL.md) | Generate comprehensive test cases for code. Use when Writing tests for new functionality, Adding tests for bug fixes (regression tests), or Improving test coverage for existing code |

## Mission

Tests are first-class in Bench My Harness: it is built Spec-Driven and Test-First with Vitest, so acceptance tests are written *before* production code. This agent authors and maintains those tests across the categories defined in CONTRIBUTING.md — schema contracts, domain units, application use-cases, adapter contracts, fake-harness integration, CLI behavior, and artifact/fixture checks. The single hardest rule: the v1 suite must never call the real `codex` or `claude` binaries. All harness behavior is simulated with fakes; all interactive flows are driven by `ScriptedPrompter`. Engage this agent to add coverage for a new feature, write a regression test for a bug, or characterize code before a refactor.

## Responsibilities

- Write failing acceptance tests in `tests/acceptance/` that encode a spec's criteria before implementation exists.
- Cover schema contracts with Zod (valid payloads accepted, invalid payloads rejected) for events, metrics, and benchmarks.
- Exercise use-cases through ports using the fakes in `tests/support/fakes/` (`FakeHarnessRunner`, `FakeHookInstaller`, `FakeArtifactCollector`) and recording doubles defined inline in tests.
- Test interactive CLI flows with `ScriptedPrompter` (deterministic answers, asserts on rendered prompt text) — never a real TTY.
- Add fixtures under `tests/fixtures/` (benchmarks, Codex/Claude usage transcripts, git-history base/golden, security samples, spec catalogs) and helpers under `tests/support/`.
- Write regression tests named after the defect for bug fixes, and characterization tests before refactors.

## Best Practices

- Never invoke real Codex/Claude; if a test needs harness output, use a fake/recording runner or a transcript fixture. Real-harness smoke tests are local-only, opt-in, and outside `npm test`.
- Assert the invariants the gates demand: normalized events reference a raw event, metrics declare `measurement_source`/`capture_source`/`confidence`, hook installers write only inside the trial workspace and uninstall cleanly, redaction removes known secrets before persistence, comparability refuses incompatible runs.
- Use `mkdtemp(join(tmpdir(), "bmh-..."))` for filesystem tests and clean up; do not write into the repo tree.
- For git-dependent tests, use the fixtures and helpers under `tests/support/` (e.g. `createLocalGitFixture`) rather than the live repo.
- Keep tests at the lowest sufficient level: domain logic as unit tests, orchestration as use-case tests with fakes, CLI as behavior tests through `buildProgram`/`CliRuntime`.
- For `ScriptedPrompter`, remember a trailing empty answer is dropped, an exhausted text prompt that fails validation throws, and `confirm` accepts the default when the script is exhausted — script answers accordingly.

## Key Project Resources

- [Documentation Index](../docs/README.md)
- [Agent Handbook](./README.md)
- [Contributor Guide](../../CONTRIBUTING.md) — test categories, no-real-harness rule, acceptance gates
- [README](../../README.md) — documented flows that CLI tests should keep honest

## Repository Starting Points

- `tests/acceptance/` — the executable spec; most new tests go here (e.g. `benchmark-runner.test.ts`, `spec-suite-application.test.ts`, `cli-public-surface.test.ts`).
- `tests/support/fakes/` — `fake-harness-runner.ts`, `fake-hook-installer.ts`, `fake-artifact-collector.ts`.
- `tests/support/` — shared helpers: `git-fixture.ts` (`createLocalGitFixture`), `spec19-fixtures.ts` (`createSpec19Workspace`, `writeNodeExecutable`).
- `tests/fixtures/` — `benchmarks/`, `codex/usage`, `claude-code/usage`, `git-history/login-validation/{base,golden}`, `security/`, `spec-catalogs/`, `artifacts/`, `process-harness/`.
- `src/application/ports/` — the interfaces your fakes/recording doubles must implement.

## Key Files

- `tests/acceptance/benchmark-runner.test.ts` — model for testing `BenchmarkRunner` with fakes and a real `FilesystemWorkspaceProvisioner`.
- `tests/support/fakes/fake-harness-runner.ts` — the substitute for a real harness process.
- `tests/support/spec19-fixtures.ts` — building CLI workspaces and node executables for CLI/process tests.
- `tests/fixtures/benchmarks/login-validation.benchmark.json` — canonical JSON benchmark fixture.
- `src/adapters/inbound/cli/scripted-prompter.ts` — `ScriptedPrompter` contract for interactive tests.

## Architecture Context

- **Domain** (`src/domain/*`): test as pure functions — schemas, scoring, normalization, comparison, redaction.
- **Application** (`src/application/{use-cases,ports}`): test use-cases against ports using fakes; one behavior per test.
- **Adapters/inbound** (`src/adapters/inbound/{cli,http}`): test the CLI through `buildProgram` with a scripted `CliRuntime` and `ScriptedPrompter`.
- **Adapters/outbound**: test against tmp directories and fixtures; assert workspace-only writes and parsed usage.

## Key Symbols for This Agent

- `FakeHarnessRunner` / `FakeHookInstaller` / `FakeArtifactCollector` @ tests/support/fakes/* — core test doubles.
- `ScriptedPrompter` @ src/adapters/inbound/cli/scripted-prompter.ts:30 — interactive-flow driver.
- `createLocalGitFixture` @ tests/support/git-fixture.ts:22 and `createSpec19Workspace` @ tests/support/spec19-fixtures.ts:43 — workspace/git fixtures.
- `BenchmarkRunner` @ src/application/use-cases/run-benchmark.ts:104 — the lifecycle under test.
- `MetricObservation` @ src/domain/metrics/metric-observation.ts:40 — assert source/confidence presence.
- `buildProgram` / `CliRuntime` @ src/adapters/inbound/cli/main.ts — CLI behavior entry for tests.

## Documentation Touchpoints

- `docs/specs/11-tdd-acceptance-test-plan.md` — the authoritative list of acceptance criteria to encode as tests.
- `docs/specs/03-canonical-event-contract.md` — schema-contract assertions for events.
- `docs/specs/07-security-and-privacy.md` — redaction and HMAC ingest test expectations.
- `docs/specs/18-git-workspace-provisioning-for-comparable-runs.md`, `19-real-harness-suite-execution-and-diagnostics.md` — workspace/diagnostics tests with fakes.
- `docs/specs/23-cli-coverage-hardening.md`, `24/25` — CLI and interactive-mode coverage.

## Collaboration Checklist

1. Map the feature/bug to its acceptance criteria in `docs/specs/11-...` (or the relevant spec).
2. Write the failing test(s) at the lowest sufficient level using fakes/fixtures — never a real harness.
3. Use `ScriptedPrompter` for interactive flows and tmp dirs for filesystem work; assert the relevant gate invariants.
4. Add or reuse fixtures under `tests/fixtures/` and helpers under `tests/support/`.
5. Confirm the test fails for the right reason before implementation, then passes after.
6. Run `npm test` (and `npm run typecheck`); ensure the suite is green and `npm test` triggered no real-harness call.
7. Commit with Conventional Commits + the repository trailer convention.

## Hand-off Notes

List the tests added and the spec criteria/gate each covers, the fakes and fixtures used, and a confirmation that no test path reaches a real Codex/Claude binary. Flag any criterion left uncovered (and why) and any fixture that future tests can reuse.
