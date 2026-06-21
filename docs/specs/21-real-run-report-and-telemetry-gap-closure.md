# Real Run Report and Telemetry Gap Closure

## Problem

The first real Spec 20 validation run used the built CLI against one `.bmh/specs` scenario:

```bash
node ./dist/adapters/inbound/cli/main.js specs run \
  --real \
  --catalog-root .bmh/specs \
  --store-root .bmh/runs \
  --workspace-root .bmh/workspaces/run_spec20_real_001 \
  --spec benchmark-prompt-files \
  --harness codex \
  --harness claude_code \
  --trials 1 \
  --run-id run_spec20_real_001
```

Both harnesses completed:

- Codex: `completed`, `duration_ms = 654775`, `hook_event_count = 209`, `total_tokens = 236427`, model `gpt-5.5`.
- Claude Code: `completed`, `duration_ms = 500760`, `hook_event_count = 152`, model/tokens/cost unavailable in normalized usage.

The run proved that real execution, artifact finalization, usage files, and `report.html` generation work, but it exposed gaps that make the report less useful for deciding which harness performed better.

## Findings

### Duration Aggregation Is Missing

Per-trial `process-exit.json` files include `duration_ms`, and each trial's `diagnostics.process.duration_ms` is present in `results.json`. However, `harness_summaries[].mean_duration_ms` is `null`, so the ranking table and duration chart show `unavailable`.

Root cause: suite summaries aggregate `trial.duration_ms`, but spec-suite trials store duration only under `trial.diagnostics.process.duration_ms`.

### Provider Transcripts Are Exposed but Not Finalized

Both hook spools exposed transcript paths:

- Codex: `/home/aicoders/.codex/sessions/...jsonl`
- Claude Code: `/home/aicoders/.claude/projects/...jsonl`

`artifact-index.json` still marks `transcript.jsonl` as missing with `transcript path was not exposed`.

Root cause: transcript path extraction finds workspace-local paths only. Real provider transcripts live outside the trial workspace and are rejected by the workspace path guard.

### Claude Code Usage Extraction Misses Real Evidence

Claude Code hooks showed:

- `TaskCreate`: 10
- `TaskUpdate`: 18
- `Bash`: 30
- `Read`: 8
- `Write`: 14
- `Edit`: 22
- `PostToolBatch`: 44

The normalized Claude usage report still contains:

- no `llms`;
- no `tokens`;
- no `subagents`;
- no `skills`;
- no `mcps`.

Root cause: the adapter expects `Task` or `Agent` tool names for subagents and relies on status-line or explicit usage records for model/tokens. Real Claude Code hook payloads expose subagent lifecycle through `TaskCreate`/`TaskUpdate` and expose transcript paths, but BMH does not parse the transcript or status/telemetry evidence yet.

### Report Ranking Treats Missing Cost as a Rankable Value

`report.html` correctly displays cost as unavailable, but ranking row metadata includes `data-cost-rank="1"` for a harness with unavailable cost. The report text says missing cost/token data should not be ranked as better than known data, but the DOM ranking metadata can still imply a winner for unavailable dimensions.

### Artifact Integrity Links Are Broken in the Inline Table

The trial artifact list uses full run-relative links, for example:

```text
specs/benchmark-prompt-files/codex/.../process-stdout.txt
```

The artifact integrity table uses bare links such as:

```html
<a href="process-stdout.txt">process-stdout.txt</a>
```

From `.bmh/runs/<run-id>/report.html`, those bare links resolve incorrectly.

### Functional Validation Can Be Skewed by Harness Sandbox Policy

Codex's full in-harness test run hit `listen EPERM: operation not permitted 127.0.0.1` for local HTTP ingest tests under `codex exec --sandbox workspace-write`, although BMH validation later passed outside the harness sandbox. This distinction matters:

- harness-internal self-verification can fail due to harness sandbox policy;
- BMH post-run validation is the comparable result source.

The report should make this distinction visible when process output contains harness-internal verification failures that are not final BMH validation failures.

## Decision

Add a follow-up implementation that closes the report and telemetry gaps found by the real run.

The system must:

1. aggregate duration from `diagnostics.process.duration_ms` when `trial.duration_ms` is absent;
2. safely collect provider transcript files referenced by hook payloads when they are outside the workspace;
3. parse Claude Code `TaskCreate`/`TaskUpdate` as subagent evidence;
4. parse Claude Code transcript/status evidence for model, tokens, and cost when present;
5. ensure ranking metadata and UI never rank unavailable cost/token values as better than known values;
6. render artifact integrity links with run-relative hrefs;
7. add report notes for harness-internal verification failures that differ from final BMH validation status.

## Scope

In scope:

- Codex and Claude Code only.
- Local provider transcript files referenced by hook payloads.
- Redacted transcript copying to run artifacts.
- Summary duration aggregation.
- HTML report ranking, charts, and links.
- Claude Code subagent evidence from `TaskCreate` and `TaskUpdate`.
- Source/confidence-aware unavailable reasons for all still-missing model/token/cost fields.

Out of scope:

- Provider billing API integration.
- Estimating cost from public pricing tables.
- Distributing aggregate tokens/cost across subagents.
- Cursor, OpenCode, and Pi adapters.
- Changing harness sandbox policy automatically.

## Contract

### Duration

`HarnessSuiteSummary.mean_duration_ms` must use:

1. `trial.duration_ms`, when present;
2. `trial.diagnostics.process.duration_ms`, when present;
3. unavailable only when neither source exists.

Duration charts and ranking tables must use the same source.

### Transcript Finalization

BMH may copy transcript files outside the workspace only when:

- the path was referenced by a hook payload captured during the same trial;
- the path is an absolute path under an approved local provider session root:
  - Codex: user Codex session directory;
  - Claude Code: user Claude project/session directory;
- the copied transcript is redacted before being written to `.bmh/runs`;
- `artifact-index.json` records the original capture source and redaction status without exposing secrets.

If transcript copying fails, `artifact-index.json` must record the real reason, for example:

- `transcript path was outside approved provider roots`;
- `transcript file was not readable`;
- `transcript redaction failed`;
- `transcript path was not exposed`.

### Claude Code Usage

Claude Code usage capture must support:

- `TaskCreate` as subagent start evidence;
- `TaskUpdate` as subagent progress/status evidence;
- `Stop`/`SessionEnd` as session completion evidence;
- transcript records for assistant model metadata when available;
- status-line or telemetry records for total tokens/cost when available.

If subagents are detected but per-subagent tokens/cost are not available, the usage report must include subagents with unavailable token/cost observations and explicit reasons.

### Ranking

For each ranking dimension:

- unavailable cost must sort after known cost in ascending-cost rankings;
- unavailable tokens must sort after known tokens in token-efficiency rankings;
- if every harness lacks the dimension, the dimension is `unavailable` and no winner should be implied;
- if some harnesses lack the dimension, the dimension is `limited`;
- DOM metadata must reflect the same status as visible text.

### Artifact Links

Every artifact link in `report.html` must be run-relative from the report file location, matching `trial.artifact_refs`.

## Acceptance Tests

Add tests before implementation.

### Duration Aggregation

`tests/acceptance/spec-suite-duration-aggregation.test.ts`

- builds a report where `duration_ms` is absent but `diagnostics.process.duration_ms` is present;
- expects `mean_duration_ms` and duration chart values to use diagnostics duration;
- keeps duration unavailable only when no duration source exists.

### Provider Transcript Finalization

`tests/acceptance/provider-transcript-finalization.test.ts`

- copies a Codex transcript from a hook-referenced provider session path;
- copies a Claude Code transcript from a hook-referenced provider session path;
- writes `transcript.jsonl` and includes it in `artifact_refs`;
- records redaction metadata in `artifact-index.json`;
- rejects non-hook-referenced absolute paths;
- rejects absolute paths outside approved provider roots.

### Claude Code Real Hook Usage

`tests/acceptance/claude-real-hook-usage-capture.test.ts`

- uses a real-shaped hook fixture with `TaskCreate`, `TaskUpdate`, `PostToolBatch`, `Stop`, and `SessionEnd`;
- extracts subagents from `TaskCreate`/`TaskUpdate`;
- records per-subagent token/cost as unavailable when no native evidence exists;
- extracts tool usage counts from `PostToolBatch`;
- extracts model/tokens/cost from transcript/status fixtures when present;
- records unavailable reasons when model/tokens/cost are absent.

### Ranking Semantics

`tests/acceptance/html-report-ranking-semantics.test.ts`

- verifies unavailable cost does not receive a better cost rank than known cost;
- verifies unavailable tokens do not receive a better token rank than known tokens;
- verifies all-unavailable dimensions are marked unavailable and show no best harness for that dimension;
- verifies ranking controls update visible rows and best-harness text consistently.

### Artifact Integrity Links

`tests/acceptance/html-report-artifact-links.test.ts`

- renders artifact integrity rows with hrefs matching run-relative artifact refs;
- does not render bare artifact filenames as links unless the artifact really lives beside `report.html`.

### Harness Internal Verification Notes

`tests/acceptance/harness-internal-verification-notes.test.ts`

- uses process output containing an in-harness test failure followed by final BMH validation success;
- expects the trial to remain `completed`;
- expects report notes to mention harness-internal verification failures separately from final validation.

## Implementation Plan

1. Add the acceptance fixtures from `run_spec20_real_001` in minimized form.
2. Fix summary duration aggregation in `suite-report`.
3. Extend artifact finalization with provider transcript allowlists and redaction.
4. Extend Claude Code usage capture for `TaskCreate`/`TaskUpdate` and transcript/status evidence.
5. Fix ranking metadata and sorting for unavailable dimensions.
6. Fix artifact integrity link rendering.
7. Add harness-internal verification notes from process output heuristics.
8. Update README report section with the new behavior.
9. Run verification.

## Verification Commands

```bash
npm test
npm run typecheck
npm run build
```

Real smoke validation:

```bash
node ./dist/adapters/inbound/cli/main.js specs run \
  --real \
  --catalog-root .bmh/specs \
  --store-root .bmh/runs \
  --workspace-root .bmh/workspaces/<run-id> \
  --spec benchmark-prompt-files \
  --harness codex \
  --harness claude_code \
  --trials 1 \
  --run-id <run-id>
```

## Risks

- Provider transcript locations are local implementation details and can change.
- Transcript artifacts may contain secrets; redaction must happen before copying to report artifacts.
- Claude Code subagent hooks expose lifecycle intent but not necessarily token/cost attribution.
- Harness-internal verification failure parsing is heuristic and must not override final BMH validation status.
