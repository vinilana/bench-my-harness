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

## Roadmap Scope

BMH is being built in phases. The current v1 foundation is focused on a local, reproducible benchmark workflow for Codex and Claude Code. Items that were previously listed as v1 non-goals are now tracked as future roadmap phases instead of being treated as permanently out of scope.

### Implemented in v1

- Codex and Claude Code adapter contracts.
- Automatic temporary hook installation per trial.
- Raw hook event preservation and canonical normalization.
- JSON/JSONL event import and reprocessing.
- Versioned JSON benchmark validation and catalog storage.
- Multi-trial benchmark orchestration with isolated workspaces.
- Process-backed fake/local harness execution for tests and controlled runs.
- Validation command execution through a port-backed runner.
- Usage, metric, comparability, scoring, and report models with source/confidence.
- JSON and Markdown report export with redaction by default.
- Local HTTP ingest with HMAC, timestamp, nonce, provider, and payload-size checks.

### Future phases

- Cursor, OpenCode, and Pi adapters.
- Distributed execution.
- Public leaderboard.
- Fine-tuning or model training workflows.
- Manual interactive benchmark mode as exploratory evidence, not as a comparable benchmark result.
- UI/dashboard, CSV export, and CI gates.

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

## Real Harness Smoke Tests

Real Codex and Claude Code smoke tests are future, local-only checks for maintainers with the required binaries, credentials, and disposable repositories. They are not acceptance tests, are not required for CI, and must not run as part of `npm test`.

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

## Getting Started

### 1. Install and build

```bash
npm install
npm run build
npm test
```

The executable entrypoint is generated at:

```bash
./dist/adapters/inbound/cli/main.js
```

You can run it directly with `node`:

```bash
node ./dist/adapters/inbound/cli/main.js --help
```

### 2. Create or validate a benchmark

BMH v1 accepts JSON benchmark files. Create one interactively:

```bash
node ./dist/adapters/inbound/cli/main.js init benchmark \
  --output benchmarks/login-validation.benchmark.json
```

Or generate a JSON template from flags:

```bash
node ./dist/adapters/inbound/cli/main.js init benchmark --template \
  --id login-validation-001 \
  --name "Login validation" \
  --category bugfix \
  --repo-url file:///workspace/app \
  --commit abc123 \
  --prompt "Add input validation to the login form." \
  --test-command "npm test" \
  --output benchmarks/login-validation.benchmark.json
```

For the repository you are currently in, use `--repo-path .`; BMH will store it as an absolute `file://` URL in the benchmark JSON:

```bash
node ./dist/adapters/inbound/cli/main.js init benchmark --template \
  --id local-001 \
  --name "Local benchmark" \
  --category feature \
  --repo-path . \
  --prompt "Do the work." \
  --test-command "npm test" \
  --output benchmarks/local.benchmark.json
```

For larger prompts, reference a Markdown prompt file instead of inline text:

```bash
node ./dist/adapters/inbound/cli/main.js init benchmark --template \
  --id login-validation-001 \
  --name "Login validation" \
  --category bugfix \
  --repo-url file:///workspace/app \
  --prompt-file login-validation.spec.md \
  --test-command "npm test" \
  --output benchmarks/login-validation.benchmark.json
```

Validate the generated benchmark before running it:

```bash
node ./dist/adapters/inbound/cli/main.js validate benchmark tests/fixtures/benchmarks/login-validation.benchmark.json
```

YAML benchmark files are intentionally rejected in v1.

### 3. Run a local dry run

Use dry-run mode to verify benchmark parsing, workspace creation, hook installation flow, and CLI output without launching Codex or Claude Code.

```bash
node ./dist/adapters/inbound/cli/main.js run \
  --benchmark tests/fixtures/benchmarks/login-validation.benchmark.json \
  --harness codex \
  --workspace-root .bmh/workspaces \
  --run-id run_local_001 \
  --trial-id codex_trial_1 \
  --dry-run
```

### 4. Run Codex

Codex is supported through the `codex` harness id. The current process runner sends the benchmark prompt to the configured process over stdin and injects `BMH_*` environment variables. Replace `args` with the non-interactive arguments required by your local Codex CLI.

```bash
node ./dist/adapters/inbound/cli/main.js run \
  --benchmark tests/fixtures/benchmarks/login-validation.benchmark.json \
  --harness codex \
  --workspace-root .bmh/workspaces \
  --run-id run_codex_001 \
  --trial-id codex_trial_1 \
  --harness-command-json '{"executable":"codex","args":[]}' \
  --run-validation
```

During the run, BMH writes project-local Codex hook configuration inside the isolated trial workspace and points hooks at `bench-my-harness hook-capture --provider codex`.

### 5. Run Claude Code

Claude Code is supported through the `claude_code` harness id. The current process runner also sends the benchmark prompt to stdin and injects `BMH_*` environment variables. Replace `args` with the non-interactive arguments required by your local Claude Code CLI.

```bash
node ./dist/adapters/inbound/cli/main.js run \
  --benchmark tests/fixtures/benchmarks/login-validation.benchmark.json \
  --harness claude_code \
  --workspace-root .bmh/workspaces \
  --run-id run_claude_001 \
  --trial-id claude_trial_1 \
  --harness-command-json '{"executable":"claude","args":[]}' \
  --run-validation
```

During the run, BMH writes project-local Claude Code hook configuration inside the isolated trial workspace and points hooks at `bench-my-harness hook-capture --provider claude_code`.

### 6. Capture a hook event directly

Harness hooks call `hook-capture` with one JSON event on stdin. This command is useful for adapter debugging:

```bash
printf '{"hook_event_name":"PreToolUse","session_id":"debug","tool_name":"Bash"}' | \
  node ./dist/adapters/inbound/cli/main.js hook-capture \
    --provider codex \
    --event PreToolUse \
    --run-id run_debug \
    --trial-id trial_debug \
    --event-source stdin \
    --spool .bmh/debug/events.jsonl
```

Use `--provider claude_code` for Claude Code hook payloads.

### 7. Render a report

Render a report JSON file directly:

```bash
node ./dist/adapters/inbound/cli/main.js report --input report.json
```

Or render a report stored at `.bmh/runs/<run-id>/report.json`:

```bash
node ./dist/adapters/inbound/cli/main.js report \
  --run-id run_codex_001 \
  --store-root .bmh/runs
```

## Commands

```bash
npm test
npm run test:watch
npm run typecheck
npm run lint
npm run build
```

Current CLI surface:

```bash
bench-my-harness hook-capture --provider codex --event PreToolUse
bench-my-harness validate benchmark benchmark.json
bench-my-harness run --benchmark benchmark.json --harness codex --dry-run
bench-my-harness run --benchmark benchmark.json --harness codex --harness-command-json '{"executable":"codex","args":[]}' --run-validation
bench-my-harness run --benchmark benchmark.json --harness claude_code --harness-command-json '{"executable":"claude","args":[]}' --run-validation
bench-my-harness report --input report.json
bench-my-harness report --run-id run_123 --store-root .bmh/runs
```

The v1 CLI is JSON-only v1 for benchmark files. YAML benchmark files are rejected by `validate benchmark` and `run`; use `.json` benchmark fixtures until YAML parsing is implemented in a later version.

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
9. Add opt-in local-only real-harness smoke tests.
10. Revisit Cursor, OpenCode, and Pi adapters.
