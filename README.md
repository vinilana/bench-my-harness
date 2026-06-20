# Bench My Harness

Bench My Harness (BMH) is a benchmark and observability harness for comparing agentic coding tools under controlled, repeatable conditions.

The v1 scope is intentionally narrow: **Codex** and **Claude Code** only. The project will expand to Cursor, OpenCode, and Pi after the core benchmark runner, hook instrumentation, event normalization, and usage capture contracts are proven with two real hook-based harnesses.

## Problem

Teams are adopting coding agents without reliable evidence about which harness performs best for their own repositories. Manual comparisons are noisy because every run can differ by prompt delivery, working directory, session history, permissions, context, model, hooks, and human timing.

BMH turns those comparisons into reproducible benchmark runs with captured events, artifacts, metrics, and explicit observability confidence.

## Goals

- Run the same benchmark prompt against Codex and Claude Code.
- Automatically instrument each harness during the run.
- Capture raw hook events and normalize them into a versioned canonical event schema.
- Preserve transcripts, diffs, test results, tool usage, command execution, and artifacts.
- Capture token, cost, and context metrics from explicit usage sources when available.
- Mark every metric with source and confidence.
- Refuse strong comparisons when data quality or harness capabilities are incompatible.

## Non-goals for v1

- Cursor, OpenCode, and Pi adapters.
- Distributed execution.
- Public leaderboard.
- Fine-tuning or model training.
- Manual interactive benchmark mode as a comparable result.

## Stack

BMH uses:

- TypeScript on Node.js 22+
- Vitest for TDD
- Zod for runtime schemas and JSON contracts
- Commander for the CLI

This stack optimizes for a CLI-first product that processes JSON hook payloads, validates versioned schemas, and can ship quickly. A native `hook-capture` binary can be introduced later if hook latency becomes a measured problem.

## Architecture

BMH follows hexagonal architecture.

The domain owns:

- benchmarks
- runs and trials
- raw hook events
- normalized events
- metric observations
- capability matrices
- comparability decisions
- artifacts

Adapters own:

- Codex hook configuration
- Claude Code hook configuration
- CLI commands
- local hook capture
- spool files
- transcript import
- usage capture
- filesystem storage

Core code must not import Codex or Claude-specific packages or schemas directly. Provider-specific behavior belongs behind ports.

## Benchmark Flow

1. The user defines a benchmark with repository state, prompt, setup commands, validation commands, limits, and expected outputs.
2. BMH creates an isolated workspace for each trial.
3. BMH installs temporary hooks for the selected harness.
4. BMH injects run metadata through environment variables.
5. BMH runs the harness in non-interactive benchmark mode.
6. The harness calls `bench-my-harness hook-capture` during lifecycle events.
7. BMH persists raw events, normalizes canonical events, and records metric observations.
8. BMH collects transcripts, diffs, validation results, usage data, and artifacts.
9. BMH removes temporary hook configuration.
10. BMH reports success, metrics, data quality, and comparability.

## Automatic Hook Instrumentation

The benchmark runner installs temporary project-local hook configuration for each trial. It must not modify global user configuration.

The hook command shape is:

```bash
bench-my-harness hook-capture \
  --provider codex \
  --run-id "$BMH_RUN_ID" \
  --trial-id "$BMH_TRIAL_ID" \
  --event-source stdin \
  --spool "$BMH_SPOOL_PATH"
```

In best-effort mode, telemetry failures do not fail the benchmark. The trial is marked with partial observability. In strict mode, telemetry failures fail the trial as `adapter_failed`.

## Observability Model

Hooks are not enough to capture everything. BMH separates:

- `HookIngestPort`: lifecycle and operational events from hooks, transcripts, and files.
- `UsageCapturePort`: tokens, cost, context usage, limits, and usage data from CLI status, SDKs, provider APIs, app servers, gateways, or local tokenizers.

Every metric must include:

- `measurement_source`
- `capture_source`
- `confidence`
- supporting event or artifact reference

## Test Strategy

BMH uses Spec Driven Development with TDD. Tests are written before production implementation.

Test categories:

- schema contract tests
- domain unit tests
- application use-case tests
- adapter contract tests
- local integration tests with fake harnesses
- CLI behavior tests
- artifact and fixture tests

The v1 test suite must not call real Codex or Claude Code. Real harness execution belongs in later smoke tests gated by local credentials and explicit opt-in.

## Project Layout

```text
src/
  domain/
  application/
  adapters/
    inbound/
    outbound/
tests/
  acceptance/
  integration/
  unit/
  fixtures/
docs/
  adrs/
  specs/
  prompts/
```

## Planned Commands

```bash
npm test
npm run test:watch
npm run typecheck
npm run lint
npm run build
```

Future CLI:

```bash
bench-my-harness run --benchmark benchmark.yml --harness codex
bench-my-harness run --benchmark benchmark.yml --harness claude_code
bench-my-harness hook-capture --provider codex --event PreToolUse
bench-my-harness report --run-id run_123
```

## Acceptance Gates

The implementation is not acceptable until:

- all tests pass;
- canonical event schemas reject invalid payloads;
- every normalized event references a raw event;
- Codex and Claude hook installers only write inside the trial workspace;
- `hook-capture` preserves events through spool fallback;
- benchmark runner installs and uninstalls hooks per trial;
- usage metrics always declare source and confidence;
- comparability policy refuses incompatible runs;
- redaction removes known secrets before reports;
- README commands and documented flows match executable behavior.

## Roadmap

1. Define contracts and failing tests.
2. Implement domain schemas and normalization.
3. Implement local raw and normalized event stores.
4. Implement `hook-capture`.
5. Implement Codex and Claude Code hook installers.
6. Implement benchmark runner with fake harness tests.
7. Implement usage capture interfaces and best-effort collectors.
8. Generate reports.
9. Add real-harness smoke tests.
10. Revisit Cursor, OpenCode, and Pi adapters.
