# TDD Acceptance Test Plan

## Principle

All v1 acceptance criteria must be represented as tests before production implementation.

The first test suite is expected to fail because production modules do not exist yet.

## Test Categories

### Schema contracts

- Validate `bmh.event.v1` minimal normalized event.
- Reject normalized events without required IDs, provider, event type, timestamps, source, run, action, quality, or security.
- Validate metric observations with `measurement_source`, `capture_source`, and `confidence`.
- Reject metrics without source or confidence.

### Raw event preservation

- Ingesting a hook event persists `RawHookEvent`.
- Normalization references the raw event by `raw_ref`.
- Payload hash is stable for identical raw payloads.
- Duplicate raw events increment duplicate count instead of creating duplicates.
- Raw events record explicit payload retention and redaction metadata.
- Normalized events preserve raw redaction status and redaction evidence hashes.

### Hook capture CLI

- Reads one JSON event from stdin.
- Adds run and trial metadata from args/env.
- Redacts known secrets before reportable persistence.
- Writes to spool when ingest endpoint is unavailable.
- Returns success in best-effort mode even when telemetry persistence fails.
- Fails in strict mode when telemetry persistence fails.

### Codex hook installer

- Writes only inside the provided trial workspace.
- Generates `.codex/hooks.json` with expected lifecycle hooks.
- Points hooks to `bench-my-harness hook-capture --provider codex`.
- Uninstalls generated files without deleting unrelated user files.
- Marks installation as partial when trust prerequisites are not satisfied.

### Claude Code hook installer

- Writes only inside the provided trial workspace.
- Generates project-local hook configuration.
- Points hooks to `bench-my-harness hook-capture --provider claude_code`.
- Includes prompt, tool pre/post, permission, compact, stop, and session end events.
- Uninstalls generated files without deleting unrelated user files.

### Benchmark runner

- Creates one isolated workspace per trial.
- Installs instrumentation before executing the harness.
- Passes the exact benchmark prompt to the harness runner.
- Collects hook events, transcript references, diffs, test results, and artifacts.
- Uninstalls instrumentation after success or failure.
- Classifies failures as agent, environment, timeout, budget, adapter, or inconclusive.

### Usage capture

- Records unavailable tokens/context/cost explicitly when no source exists.
- Preserves native usage as higher confidence than estimates.
- Does not mix native and estimated token counts silently.
- Supports provider-specific collectors behind `UsageCapturePort`.

### Comparability

- Marks runs comparable when benchmark version, harness config, model policy, permissions, and metric sources are compatible.
- Marks runs limited when important metrics are estimated or partial.
- Marks runs not comparable when critical setup differs.

### Redaction

- Redacts API keys, authorization headers, cookies, private keys, and `.env` style assignments.
- Preserves hashes for redacted payloads.
- Ensures reports never contain raw known secrets by default.

### README gates

- Documented commands exist in `package.json`.
- README v1 scope mentions Codex and Claude Code only.
- README explains best-effort vs strict telemetry.
- README states that real Codex/Claude smoke tests are opt-in.

## Fixtures

Required fixtures:

- Codex `UserPromptSubmit`
- Codex `PreToolUse`
- Codex `PostToolUse`
- Codex `Stop`
- Claude Code `UserPromptSubmit`
- Claude Code `PreToolUse`
- Claude Code `PostToolUse`
- Claude Code `PermissionRequest`
- Claude Code `Stop`
- secret-bearing raw event
- invalid normalized event
- benchmark YAML fixture
- fake harness transcript
