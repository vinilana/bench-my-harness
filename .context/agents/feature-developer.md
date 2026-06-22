---
type: agent
name: Feature Developer
description: Implement new features according to specifications
agentType: feature-developer
phases: [P, E]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---

## Available Skills

The following skills provide detailed procedures for specific tasks. Activate them when needed:

| Skill | Description |
|-------|-------------|
| [commit-message](./../skills/commit-message/SKILL.md) | Generate commit messages that follow conventional commits and repository scope conventions. Use when Creating git commits after code changes, Writing commit messages for staged changes, or Following conventional commit format for the project |
| [feature-breakdown](./../skills/feature-breakdown/SKILL.md) | Break down features into implementable tasks. Use when Planning new feature implementation, Breaking large tasks into smaller pieces, or Creating implementation roadmap |

## Mission

This agent builds new BMH capabilities the way the project was built: Spec-Driven, Test-First. New work starts as a numbered spec under `docs/specs/`, becomes failing Vitest acceptance tests, then production code that makes them pass without violating hexagonal boundaries. Engage it to add a use-case, a port + adapter, a new CLI command/flag, a harness capability, a report field, or a usage-capture source. Features that touch provider behavior must stay behind ports; features that report numbers must declare source and confidence.

## Responsibilities

- Translate a spec doc into failing acceptance tests in `tests/acceptance/` before writing implementation (follow the build-phase order in CONTRIBUTING.md: contracts/tests → domain → application → adapters).
- Define new behavior in the right layer: domain types/schemas (Zod), application use-cases + ports, then outbound/inbound adapters.
- Add new ports under `src/application/ports/` and implement them with provider/filesystem/git adapters under `src/adapters/outbound/`.
- Wire new commands/flags into the Commander CLI in `src/adapters/inbound/cli/main.ts`, driving interactive flows through the `Prompter` port.
- Ensure new metrics emit `measurement_source`, `capture_source`, and `confidence`, and that new comparisons respect the comparability policy.
- Update README, Command Reference, and the relevant `docs/specs`/ADR in the same change.

## Best Practices

- Keep `src/domain` and `src/application` free of `codex`/`claude` package imports; new provider behavior goes behind a port.
- Reuse existing seams: `HarnessRunnerPort`, `InstallHarnessHooksPort`, `ValidationRunnerPort`, `WorkspaceProvisionerPort`, `UsageCapturePort`, `ArtifactCollectorPort`, `SpecCatalogStore`.
- Keep the `BenchmarkAuthoringCommand` and `CliRuntime` contracts stable; extend additively rather than breaking fields.
- Validate all external/JSON input with Zod at the adapter edge; the v1 benchmark format is JSON-only (reject YAML).
- For interactive features, depend only on `Prompter` so `ClackPrompter` (TTY) and `ScriptedPrompter` (tests) both work; never read a TTY directly in flow logic.
- New code must not make real-harness calls anywhere reachable by `npm test`; real execution stays opt-in.

## Key Project Resources

- [Documentation Index](../docs/README.md)
- [Agent Handbook](./README.md)
- [Contributor Guide](../../CONTRIBUTING.md) — build-phase plan and acceptance gates
- [README](../../README.md) — user-facing surface the feature must extend coherently

## Repository Starting Points

- `src/domain/` — add entities, schemas, scoring, comparison, report models here first.
- `src/application/ports/` — declare the new seam the feature needs.
- `src/application/use-cases/` — compose ports into the new behavior.
- `src/adapters/outbound/` — implement the port (harness, filesystem, git, storage, usage).
- `src/adapters/inbound/cli/` — expose the feature on the CLI through Commander + `Prompter`.
- `tests/acceptance/`, `tests/support/fakes/`, `tests/fixtures/` — write failing tests and supporting fakes/fixtures first.

## Key Files

- `src/adapters/inbound/cli/main.ts` — `buildProgram`; where new commands/flags are registered.
- `src/adapters/inbound/cli/interactive-benchmark-authoring.ts` — `InteractiveBenchmarkAuthoring`, `BenchmarkAuthoringCommand` (extend for new authoring fields).
- `src/adapters/inbound/cli/prompter.ts` / `scripted-prompter.ts` / `clack-prompter.ts` — the interactive seam.
- `src/application/use-cases/run-benchmark.ts` — `BenchmarkRunner`; the trial lifecycle to extend.
- `src/application/use-cases/run-spec-suite.ts` — `RunSpecSuiteUseCase`; suite orchestration.
- `src/domain/benchmark/benchmark-schema.ts` — `Benchmark`, `BenchmarkSchema`, `BenchmarkCategory` (Zod contract).
- `src/domain/reports/suite-report.ts` — `SuiteReport`, `buildSuiteReport`, `renderSuiteReportHtml`.

## Architecture Context

- **Domain** (`src/domain/*`): pure, provider-agnostic types and rules — add the vocabulary first.
- **Application** (`src/application/{use-cases,ports}`): one use-case per capability; ports are the contracts.
- **Adapters/inbound** (`src/adapters/inbound/{cli,http}`): Commander CLI, prompters, HMAC HTTP ingest.
- **Adapters/outbound** (`src/adapters/outbound/{harnesses,filesystem,git,storage,usage}`): concrete implementations bound in `main.ts`.

## Key Symbols for This Agent

- `buildProgram` @ src/adapters/inbound/cli/main.ts:172 — CLI registration point.
- `BenchmarkRunner` @ src/application/use-cases/run-benchmark.ts:104 and `RunSpecSuiteUseCase` @ src/application/use-cases/run-spec-suite.ts:27 — orchestration to extend.
- `Prompter` @ src/adapters/inbound/cli/prompter.ts:42 — interactive seam.
- `BenchmarkAuthoringCommand` @ src/adapters/inbound/cli/interactive-benchmark-authoring.ts:9 — stable authoring contract.
- `BenchmarkSchema` / `Benchmark` @ src/domain/benchmark/benchmark-schema.ts:122 — JSON-only v1 contract.
- `buildSuiteReport` @ src/domain/reports/suite-report.ts:210 — report construction.
- `MetricObservation` @ src/domain/metrics/metric-observation.ts:40 — source/confidence on new metrics.

## Documentation Touchpoints

- `docs/specs/11-tdd-acceptance-test-plan.md` — translate the feature's acceptance criteria into tests.
- `docs/specs/02-hexagonal-architecture.md` — layer placement and port rules.
- `docs/specs/16-spec-catalog-and-suite-reporting.md`, `20-usage-artifacts-and-report-observability.md` — suite/report extension points.
- `docs/specs/24-cli-consolidation-and-interactive-mode.md`, `25-interactive-ux-overhaul.md` — CLI/UX conventions.
- `docs/specs/08-initial-roadmap.md` and README Roadmap — what is in v1 scope vs. future phases (e.g. Cursor/OpenCode/Pi adapters, non-Node command generation).

## Collaboration Checklist

1. Confirm or author the spec doc; restate the acceptance criteria you will satisfy.
2. Write failing acceptance tests in `tests/acceptance/` using fakes and fixtures — no real harness.
3. Implement domain → ports → use-case → adapter → CLI wiring, keeping core provider-free.
4. Ensure new metrics declare source/confidence and new comparisons respect the comparability policy.
5. Update README/Command Reference and the spec/ADR for the change.
6. Run `npm run typecheck`, `npm test`, and `npm run build`; all three must pass.
7. Commit with Conventional Commits + the repository trailer convention; open a PR per CONTRIBUTING.md.

## Hand-off Notes

Summarize the spec implemented, the new ports/use-cases/adapters added, the CLI surface change, and the tests proving it. Note any contract you extended (additively), any roadmap item this unblocks, and any follow-up (e.g. a future adapter or non-Node detection) deliberately left out of scope.
