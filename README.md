# Bench My Harness

Bench My Harness (BMH) is a benchmark and observability harness for comparing agentic coding tools under controlled, repeatable conditions.

The v1 scope is intentionally narrow: **Codex** and **Claude Code** only. The project will expand to Cursor, OpenCode, and Pi after the core benchmark runner, hook instrumentation, event normalization, and usage capture contracts are proven with two real hook-based harnesses.

## Problem

Everyone is investing heavily in their agent setup: installing skills, adopting spec-driven development, building workflows, swapping between models, and stacking context layer on context layer. It is real work, and everyone has strong opinions about what helps. But when it comes time to prove that any of those changes actually improved the result, there is no number. The decision is made on instinct and a stray screenshot.

The same gap shows up when teams adopt coding agents without reliable evidence about which harness performs best for their own repositories. Manual comparisons are noisy because every run can differ by prompt delivery, working directory, session history, permissions, context, model, hooks, and human timing. Two runs are never the same, so the conclusion collapses into guesswork.

BMH closes that gap. It turns those comparisons into reproducible benchmark runs with captured events, artifacts, metrics, and explicit observability confidence. The intended loop is simple: measure your current setup, change one variable — a skill, a workflow, a context layer, the model — and measure again. The discussion stops being "I think it got better" and becomes time, cost, and passing tests, side by side.

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
- Best-effort usage capture for real Codex and Claude Code suite runs, including model, token, cost, subagent, skill, and MCP fields when sources expose them.
- Per-trial artifact finalization with `usage.json`, `artifact-index.json`, process diagnostics, hooks, transcripts, diffs, and validation output.
- JSON and Markdown report export with redaction by default.
- Local HTTP ingest with HMAC, timestamp, nonce, provider, and payload-size checks.
- Local `.bmh/specs` catalogs for benchmark suites built from feature specs.
- CLI spec authoring, including backward Git draft generation and capped backfill.
- Static redacted `report.html` generation for suite runs, with filters, rankings, charts, usage coverage, artifact integrity, and harness comparison by time, cost, and token efficiency.

### Future phases

- Cursor, OpenCode, and Pi adapters.
- Distributed execution.
- Public leaderboard.
- Fine-tuning or model training workflows.
- Manual interactive benchmark mode as exploratory evidence, not as a comparable benchmark result.
- Project command generation for Python, Rust, Go, .NET, and Java/Kotlin repositories.
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
6. The harness calls `bmh internal hook-capture` during lifecycle events.
7. BMH persists raw events, normalizes canonical events, and records metric observations.
8. BMH collects transcripts, diffs, validation results, usage data, and artifacts.
9. BMH removes temporary hook configuration.
10. BMH reports success, metrics, data quality, and comparability.

## Automatic Hook Instrumentation

The benchmark runner installs temporary project-local hook configuration for each trial. It must not modify global user configuration.

The hook command shape is:

```bash
bmh internal hook-capture \
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

For Codex and Claude Code, BMH also reads local session transcript JSONL when it is available as a trial artifact. Codex transcript usage comes from native `token_count` records and can include input, output, cached input, and total tokens. Claude Code transcript usage deduplicates assistant message usage records and includes cache read/write tokens in totals. When native cost is missing, BMH falls back to embedded pricing for explicitly supported known models and labels the metric as estimated. Unknown OpenAI model variants remain unavailable instead of being priced through partial model-name matching.

BMH does not scan provider session directories blindly. A provider-local transcript must be returned by the harness runner or referenced by a hook event, live under an approved Codex or Claude Code provider root, and pass lightweight trial identity checks before usage capture trusts it.

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

Real Codex and Claude Code smoke tests are local-only checks for maintainers with the required binaries, credentials, and disposable repositories. They are not acceptance tests, are not required for CI, and must not run as part of `npm test`.

For spec catalogs, real execution is explicit:

```bash
node ./dist/adapters/inbound/cli/main.js run \
  --real \
  --catalog-root .bmh/specs \
  --store-root .bmh/runs \
  --workspace-root .bmh/workspaces \
  --harness codex \
  --trials 1 \
  --run-id local_codex_real_001
```

Real suite runs create one git checkout per trial at the benchmark `repo.base_ref`, install project-local hooks inside that checkout, run the harness, execute validation commands, capture best-effort usage data, and write `results.json`, `report.html`, per-trial `result.json`, `process-stdout.txt`, `process-stderr.txt`, `process-exit.json`, `hooks.jsonl`, `usage.json`, and `artifact-index.json` under `.bmh/runs/<run-id>`.

`report.html` is the main comparison artifact. It includes harness ranking controls, duration/score/token/cost charts, observability coverage, artifact integrity, model usage, subagent usage when available, skills, MCP usage, and source/confidence badges for usage metrics. Missing cost or token evidence is shown as unavailable or limited instead of being treated as better than known values.

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

When installed as a package, the CLI binary is `bmh`.

### 2. Create or validate a benchmark

BMH v1 accepts JSON benchmark files. Create one interactively:

```bash
node ./dist/adapters/inbound/cli/main.js benchmark init \
  --output benchmarks/login-validation.benchmark.json
```

Or generate a JSON template from flags:

```bash
node ./dist/adapters/inbound/cli/main.js benchmark init --template \
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
node ./dist/adapters/inbound/cli/main.js benchmark init --template \
  --id local-001 \
  --name "Local benchmark" \
  --category feature \
  --repo-path . \
  --prompt "Do the work." \
  --test-command "npm test" \
  --output benchmarks/local.benchmark.json
```

BMH can also generate setup and validation commands for supported local projects:

```bash
node ./dist/adapters/inbound/cli/main.js benchmark init --template \
  --id local-001 \
  --name "Local benchmark" \
  --category feature \
  --repo-path . \
  --detect-commands \
  --prompt "Do the work." \
  --output benchmarks/local.benchmark.json
```

The generated benchmark stores explicit commands such as `npm install`, `npm test`, and `npm run typecheck`. Command generation is currently focused on Node.js projects. Roadmap support includes Python, Rust, Go, .NET, and Java/Kotlin project detection.

For larger prompts, reference a Markdown prompt file instead of inline text:

```bash
node ./dist/adapters/inbound/cli/main.js benchmark init --template \
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
node ./dist/adapters/inbound/cli/main.js benchmark validate tests/fixtures/benchmarks/login-validation.benchmark.json
```

YAML benchmark files are intentionally rejected in v1.

### 3. Run a local dry run

Use dry-run mode to verify benchmark parsing, workspace creation, hook installation flow, and CLI output without launching Codex or Claude Code.

```bash
node ./dist/adapters/inbound/cli/main.js benchmark run \
  --benchmark tests/fixtures/benchmarks/login-validation.benchmark.json \
  --harness codex \
  --workspace-root .bmh/workspaces \
  --run-id run_local_001 \
  --trial-id codex_trial_1 \
  --dry-run
```

### 4. Run Codex

Codex is supported through the `codex` harness id. For suite execution, `run --real --harness codex` uses the built-in Codex process profile:

```text
codex exec --skip-git-repo-check --sandbox workspace-write --dangerously-bypass-hook-trust -
```

The prompt is sent over stdin and `BMH_*` environment variables are injected. For one-off benchmark execution, you may still pass an explicit command:

```bash
node ./dist/adapters/inbound/cli/main.js benchmark run \
  --benchmark tests/fixtures/benchmarks/login-validation.benchmark.json \
  --harness codex \
  --workspace-root .bmh/workspaces \
  --run-id run_codex_001 \
  --trial-id codex_trial_1 \
  --harness-command-json '{"executable":"codex","args":[]}' \
  --run-validation
```

Codex usage capture is best effort. When a run artifact includes a Codex session transcript JSONL file, BMH can report model, input/output/cached-input/total tokens, and estimated cost for explicitly supported OpenAI models. Cache write tokens remain unavailable unless Codex exposes them directly.

OpenAI cost estimates default to Standard pricing. Set `BMH_OPENAI_PRICING_MODE=priority` when the benchmark should estimate Codex usage with Priority pricing:

```bash
BMH_OPENAI_PRICING_MODE=priority bmh run --real --harness codex
```

During the run, BMH writes project-local Codex hook configuration inside the isolated trial workspace and points hooks at `bmh internal hook-capture --provider codex`.

### 5. Run Claude Code

Claude Code is supported through the `claude_code` harness id. The process runner sends the benchmark prompt to stdin and injects `BMH_*` environment variables. The v1 built-in Claude Code real process profile is documented as an adapter contract; use `--harness-command-json` when your local Claude command needs explicit arguments.

```bash
node ./dist/adapters/inbound/cli/main.js benchmark run \
  --benchmark tests/fixtures/benchmarks/login-validation.benchmark.json \
  --harness claude_code \
  --workspace-root .bmh/workspaces \
  --run-id run_claude_001 \
  --trial-id claude_trial_1 \
  --harness-command-json '{"executable":"claude","args":[]}' \
  --run-validation
```

During the run, BMH writes project-local Claude Code hook configuration inside the isolated trial workspace and points hooks at `bmh internal hook-capture --provider claude_code`.

Claude Code usage capture is best effort. When a run artifact includes a Claude transcript JSONL file, BMH can report model, input/output/cache/total tokens, and cost. Cost is native when Claude provides `costUSD`; otherwise BMH estimates known Claude models from embedded pricing and marks the value as estimated.

### 6. Capture a hook event directly

Harness hooks call `internal hook-capture` with one JSON event on stdin. This command is useful for adapter debugging:

```bash
printf '{"hook_event_name":"PreToolUse","session_id":"debug","tool_name":"Bash"}' | \
  node ./dist/adapters/inbound/cli/main.js internal hook-capture \
    --provider codex \
    --event PreToolUse \
    --run-id run_debug \
    --trial-id trial_debug \
    --event-source stdin \
    --spool .bmh/debug/events.jsonl
```

Use `--provider claude_code` for Claude Code hook payloads.

### 7. Create a local spec catalog

For repository-specific benchmark suites, create a catalog under `.bmh/specs`:

```bash
node ./dist/adapters/inbound/cli/main.js init
```

To ask a coding agent to initialize the catalog for an existing repository, copy the prompt in:

```text
docs/prompts/initialize-bmh-spec-catalog-prompt.md
```

This writes:

```text
.bmh/specs/suite.json
```

Configure authoring defaults:

```bash
node ./dist/adapters/inbound/cli/main.js init \
  --repo-path . \
  --category feature \
  --setup-command "npm install" \
  --test-command "npm test" \
  --harness codex \
  --harness claude_code \
  --trials 3 \
  --include-in-suite
```

Then create feature specs from Markdown prompts. BMH infers the spec id from the file name and the display name from the first Markdown H1:

```bash
node ./dist/adapters/inbound/cli/main.js add ./docs/login-validation.md \
  --base-ref <commit-before-feature> \
  --golden-ref <commit-after-feature>
```

Import multiple prompt files with the same refs:

```bash
node ./dist/adapters/inbound/cli/main.js import "docs/specs/*.md" \
  --base-ref <commit-before-feature> \
  --golden-ref <commit-after-feature>
```

This writes:

```text
.bmh/specs/features/login-validation/spec.md
.bmh/specs/features/login-validation/benchmark.json
```

### 8. Create backward specs from Git history

For features that already exist, create a review-needed backward draft from Git evidence:

```bash
node ./dist/adapters/inbound/cli/main.js add --from-git \
  --id login-validation \
  --name "Login validation" \
  --category bugfix \
  --repo-path . \
  --base-ref <commit-before-feature> \
  --golden-ref <commit-after-feature> \
  --test-command "npm test" \
  --include-in-suite
```

BMH records changed files and commit evidence, but marks the generated spec as a draft with `review_status = "needs_human_review"`.

To create multiple drafts from a commit range:

```bash
node ./dist/adapters/inbound/cli/main.js add --from-git \
  --repo-path . \
  --range main~25..main
```

`add --from-git` creates at most `25` drafts by default. Override this with `--limit <count>`. Drafts are not added to `suite.json` unless `--include-in-suite` is provided.

### 9. Validate and run a spec suite locally

Validate the catalog:

```bash
node ./dist/adapters/inbound/cli/main.js doctor
```

Run the suite with fake harness execution:

```bash
node ./dist/adapters/inbound/cli/main.js smoke --run-id local_suite_001
```

Dry-run suite execution writes:

```text
.bmh/runs/local_suite_001/results.json
.bmh/runs/local_suite_001/report.html
.bmh/runs/local_suite_001/specs/<spec-id>/<harness>/<trial-id>/result.json
```

Real Codex and Claude Code execution is supported as an explicit local smoke workflow through `run --real`. Use it only in disposable workspaces or with reviewed specs because the selected harness will be allowed to edit the benchmark checkout.

### 10. Render a report

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

Render or re-render a suite HTML report:

```bash
node ./dist/adapters/inbound/cli/main.js report \
  --run-id local_suite_001 \
  --store-root .bmh/runs \
  --format html
```

The HTML file is written to:

```text
.bmh/runs/local_suite_001/report.html
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
bmh internal hook-capture --provider codex --event PreToolUse
bmh init
bmh init --repo-path . --setup-command "npm install" --test-command "npm test" --harness codex --harness claude_code --include-in-suite
bmh add docs/specs/example.md --base-ref <base> --golden-ref <golden>
bmh import "docs/specs/*.md" --base-ref <base> --golden-ref <golden>
bmh add --from-git --base-ref <base> --golden-ref <golden>
bmh add --from-git --repo-path . --range main~25..main
bmh doctor
bmh run --dry-run --run-id local_suite_001 --harness codex --harness claude_code
bmh run --real --run-id local_codex_real_001 --harness codex --trials 1
bmh smoke --run-id local_suite_001
bmh benchmark validate benchmark.json
bmh benchmark run --benchmark benchmark.json --harness codex --dry-run
bmh benchmark run --benchmark benchmark.json --harness codex --harness-command-json '{"executable":"codex","args":[]}' --run-validation
bmh benchmark run --benchmark benchmark.json --harness claude_code --harness-command-json '{"executable":"claude","args":[]}' --run-validation
bmh report --input report.json
bmh report --run-id run_123 --store-root .bmh/runs
bmh report --run-id local_suite_001 --store-root .bmh/runs --format html
```

The v1 CLI is JSON-only v1 for benchmark files. YAML benchmark files are rejected by `benchmark validate` and `benchmark run`; use `.json` benchmark fixtures until YAML parsing is implemented in a later version.

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
9. Add local spec catalogs and static HTML suite reports.
10. Add opt-in local-only real-harness smoke tests.
11. Revisit Cursor, OpenCode, and Pi adapters.
