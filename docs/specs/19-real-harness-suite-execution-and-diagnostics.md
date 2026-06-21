# Real Harness Suite Execution and Diagnostics

## Problem

The first attempt to run the local spec catalog with a real Codex harness exposed several execution and diagnostics gaps.

The suite command failed:

```bash
bench-my-harness run \
  --catalog-root .bmh/specs \
  --harness codex \
  --trials 1 \
  --run-id local_specs_codex_real_001
```

Result:

```text
spec suite real harness execution is not configured for this CLI build; rerun with --dry-run
```

A single benchmark could be executed only by manually providing `--harness-command-json`:

```bash
bench-my-harness run \
  --benchmark .bmh/specs/cases/project-command-generation/benchmark.json \
  --harness codex \
  --harness-command-json '{"executable":"codex","args":["exec","--skip-git-repo-check","--sandbox","workspace-write","--dangerously-bypass-hook-trust","-"]}'
```

Additional findings:

- the first manual Codex command failed because `codex exec` does not accept `--ask-for-approval`;
- hook commands require `bench-my-harness` to be on `PATH`, so local development needed a temporary shim in `.bmh/bin`;
- `run` has no real harness runner wiring even though individual `run` can use `ProcessHarnessRunner`;
- the CLI does not stream or summarize harness stdout/stderr while a real run is active;
- failures from the process harness are collapsed into `agent_failed` without enough visible diagnostics;
- the successful real trial captured 138 Codex hook events, proving that real hook capture works once the process command and PATH are correct.

These gaps make real suite execution difficult to use and hard to debug.

## Decision

Add first-class real harness command profiles for suite execution and improve diagnostics for long-running real harness trials.

BMH must allow:

```bash
bench-my-harness run --real --harness codex --trials 1
```

to run real Codex trials when Codex is installed and the user has explicitly opted into real execution.

Dry-run behavior remains the default testing path for CI and acceptance tests.

## Scope

In scope:

- Codex process profile for `codex exec`;
- Claude Code process profile placeholder/contract for v1 parity;
- real suite execution through `run`;
- explicit opt-in safeguards;
- local development resolution of the `bench-my-harness` hook command;
- per-trial process diagnostics;
- progress output for long-running real suite runs;
- fake process fixtures for acceptance tests.

Out of scope:

- remote harness execution;
- Cursor, OpenCode, or Pi production adapters;
- native token/context usage extraction beyond existing source-confidence rules;
- automatic global installation of BMH;
- mutating user-level harness configuration.

## CLI Contract

### Real Suite Execution

`run` must support real harness execution:

```bash
bench-my-harness run \
  --catalog-root .bmh/specs \
  --harness codex \
  --trials 1 \
  --run-id local_specs_codex_real_001 \
  --real
```

Rules:

- `--dry-run` keeps existing fake behavior.
- `--real` explicitly opts into real harness processes.
- If neither `--dry-run` nor `--real` is supplied, BMH may keep the current conservative behavior or prompt in interactive mode.
- Non-interactive real execution must require `--real`.
- `--real` and `--dry-run` are mutually exclusive.
- Real execution must fail fast before the suite starts when the requested harness executable is missing.

### Harness Command Profiles

BMH must provide built-in process profiles:

```text
codex -> codex exec --skip-git-repo-check --sandbox workspace-write --dangerously-bypass-hook-trust -
claude_code -> claude ...
```

The Codex profile must not include `--ask-for-approval`, because `codex exec` does not accept that flag in the observed CLI version.

Users may override profiles:

```bash
bench-my-harness run \
  --real \
  --harness codex \
  --harness-command-json '{"codex":{"executable":"codex","args":["exec","-"]}}'
```

Exact override shape may be refined during implementation, but it must support per-harness command configuration for suite execution.

### Hook Command Resolution

Generated hooks currently call:

```bash
bench-my-harness internal hook-capture ...
```

Real runs must ensure that command resolves inside the harness process.

Allowed approaches:

- inject a trial-local or run-local shim directory into `PATH`;
- generate hooks using an absolute command path to the current BMH executable;
- allow `--hook-command <path>` for explicit operator control.

Rules:

- do not require global npm installation for local development;
- do not mutate shell profiles;
- do not mutate global Codex or Claude Code config;
- record the hook command strategy in trial diagnostics.

## Diagnostics Contract

Each real process trial must persist:

```text
.bmh/runs/<run-id>/specs/<spec-id>/<harness>/<trial-id>/
  process-stdout.txt
  process-stderr.txt
  process-exit.json
  hooks.jsonl
  transcript.jsonl
  diff.patch
  test-output.txt
  result.json
```

`process-exit.json`:

```json
{
  "executable": "codex",
  "args": ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--dangerously-bypass-hook-trust", "-"],
  "exit_code": 0,
  "timed_out": false,
  "started_at": "2026-06-21T01:26:38.000Z",
  "ended_at": "2026-06-21T01:30:41.000Z",
  "duration_ms": 243000
}
```

Rules:

- stdout and stderr must be captured even when the harness fails;
- a failed executable lookup must be classified as `environment_failed`, not `agent_failed`;
- a non-zero harness exit code remains `agent_failed` unless setup or infrastructure evidence says otherwise;
- timeout remains `timeout`;
- diagnostics must be linked from `result.json` and `report.html`.

## Progress Output

Long-running real suite runs should emit progress without leaking full prompts or secrets:

```text
starting trial 1/4: project-command-generation codex
trial completed: project-command-generation codex completed duration=243s hooks=138
```

Rules:

- do not stream raw hook payloads by default;
- do not print secrets or full prompt text;
- print enough information to distinguish a hung harness from an active trial;
- preserve machine-readable artifacts for detailed analysis.

## Architecture

### Domain

No provider-specific command details in domain models.

The domain may represent generic process diagnostics and result references.

### Application

Add or extend use cases so suite execution can receive a real `HarnessRunnerPort` implementation, not only `DryRunHarnessRunner`.

Suite execution should not know the exact Codex or Claude command. It should receive configured ports or provider-neutral command profiles from the adapter layer.

### Adapters

CLI responsibilities:

- parse `--real`;
- reject incompatible `--real` and `--dry-run`;
- resolve command profiles for selected harnesses;
- inject hook command path strategy;
- wire `ProcessHarnessRunner` into `RunSpecSuiteUseCase`;
- pass a diagnostics-capable artifact collector.

Harness adapter responsibilities:

- Codex profile owns `codex exec` command details;
- Claude Code profile owns Claude command details;
- profile validation checks executable availability.

Filesystem adapter responsibilities:

- persist process stdout/stderr/exit diagnostics;
- preserve hook spool artifacts;
- link diagnostics into result and report artifacts.

## Acceptance Tests

Add tests before implementation.

### `tests/acceptance/cli-spec-real-run.test.ts`

- `run --real --harness codex` wires a process harness runner for suite execution;
- `run --real --dry-run` is rejected;
- missing executable fails before trial execution with a clear error;
- `--harness-command-json` can override the built-in command profile in suite mode;
- real suite mode uses fake local process fixtures, not real Codex or Claude binaries.

### `tests/acceptance/harness-command-profiles.test.ts`

- Codex profile uses `codex exec`;
- Codex profile reads prompt from stdin using `-`;
- Codex profile does not include unsupported `--ask-for-approval`;
- Codex profile includes workspace-safe sandbox defaults;
- Claude Code profile exposes a v1 command contract or reports unsupported with a clear capability status.

### `tests/acceptance/hook-command-resolution.test.ts`

- real runs make `bench-my-harness internal hook-capture` resolvable without global installation;
- hook command path strategy is recorded in trial diagnostics;
- generated hook commands still write only inside the trial workspace;
- local shim directories are created under `.bmh` or the run workspace and are not committed by default.

### `tests/acceptance/process-diagnostics.test.ts`

- captures stdout for successful process harness trials;
- captures stderr for failed process harness trials;
- persists `process-exit.json`;
- classifies missing executable as `environment_failed`;
- exposes diagnostics links in `result.json`;
- includes diagnostics in `report.html`.

### `tests/acceptance/spec-suite-progress.test.ts`

- emits start and completion lines per real trial;
- does not print full prompt text;
- reports hook count when hook spool exists;
- reports duration for each trial.

## Data and Source Confidence

Real harness execution does not imply native token, context, or cost availability.

The successful Codex run captured lifecycle and tool events, but token/context/cost must remain:

```json
{
  "measurement_source": "unavailable",
  "capture_source": "usage_capture",
  "confidence": "none"
}
```

unless a future usage collector imports a reliable native source.

Process diagnostics are operational evidence, not usage metrics.

## Security

- Real mode must be explicit in non-interactive CLI usage.
- BMH must not modify global user config.
- BMH must not install global npm binaries.
- Hook command shims must be created under controlled workspace or `.bmh` paths.
- Reports must not include raw secrets from stdout, stderr, hook payloads, or prompts.
- `--dangerously-bypass-hook-trust` may be part of the Codex automation profile only because hooks are generated by BMH inside the isolated workspace; document this clearly in README.

## Implementation Sequence

1. Add failing acceptance tests for real suite CLI wiring.
2. Add harness command profile module for Codex and Claude Code.
3. Add CLI `--real` handling and validation.
4. Wire `ProcessHarnessRunner` into `run --real`.
5. Add hook command resolution strategy for local development and packaged usage.
6. Persist stdout, stderr, and process exit diagnostics.
7. Add progress output for real suite trials.
8. Update README real harness smoke tests and current CLI surface.
9. Re-run local Codex smoke against one spec, then against a small suite once git workspace provisioning is implemented.

## Verification Commands

```bash
npm test -- tests/acceptance/cli-spec-real-run.test.ts
npm test -- tests/acceptance/harness-command-profiles.test.ts
npm test -- tests/acceptance/hook-command-resolution.test.ts
npm test -- tests/acceptance/process-diagnostics.test.ts
npm test -- tests/acceptance/spec-suite-progress.test.ts
npm test
npm run typecheck
npm run build
```

## Done Criteria

- `run --real --harness codex --trials 1` runs without manual `--harness-command-json` for Codex.
- Real suite mode captures hook events and process diagnostics for every trial.
- A missing harness executable is reported before expensive work starts.
- Long-running real trials show safe progress output.
- Token/context/cost remain explicitly unavailable unless a reliable source is added.
- Real suite tests use fake process fixtures and remain deterministic in CI.
