# Usage, Artifact, and Report Observability

## Problem

The first real suite run with one spec across Codex and Claude Code proved that real harness execution works, but it also exposed observability gaps:

- `results.json` referenced artifacts such as `diff.patch`, `test-output.txt`, and `transcript.jsonl` that were not materialized on disk.
- Codex printed a token summary in process output, but normalized BMH metrics still reported `token_usage` as unavailable.
- Claude Code completed successfully, but BMH did not extract model, token, cost, subagent, skill, or MCP usage into structured metrics.
- `report.html` did not make missing observability explicit enough for a user comparing harnesses.

BMH needs a reliable way to collect and report:

- total cost;
- LLM/model used;
- subagents used;
- LLM/model used by subagent;
- total cost by subagent;
- skills used;
- MCP servers/tools used;
- total tokens used;
- tokens used by subagent when available;
- artifact integrity for every referenced file.

Hooks alone are not sufficient for all of these fields. This feature must implement multi-source usage capture while preserving source confidence.

## Decision

Add a dedicated usage and artifact finalization layer for real suite runs.

The system must:

1. collect process diagnostics already produced by `ProcessHarnessRunner`;
2. collect hook spool events;
3. copy or normalize provider transcripts when a hook event exposes a transcript path;
4. generate final artifacts that are referenced by `result.json`;
5. extract usage observations from provider-specific sources through adapters;
6. aggregate those observations into suite summaries;
7. render source-aware observability sections in `report.html`.

This spec follows ADR-013: operational events and usage capture remain separate.

## Scope

In scope for v1:

- Codex real suite runs;
- Claude Code real suite runs;
- local filesystem artifacts;
- hook spool based evidence;
- process stdout/stderr based evidence;
- provider transcript based evidence;
- Claude Code OpenTelemetry evidence when explicitly enabled by BMH for the trial;
- source/confidence-aware metrics in `results.json` and `report.html`;
- artifact integrity validation before report generation.

Out of scope:

- Cursor, OpenCode, and Pi production adapters;
- remote execution;
- organization admin usage dashboards as a required source;
- provider billing APIs as the first implementation;
- estimating monetary cost when no pricing source is configured;
- claiming complete token or context coverage when the source is partial.

## Source Strategy

BMH must collect each field from the strongest available source and record fallback behavior explicitly.

### Codex

Primary sources:

- hook payloads for `model`, `tool_name`, MCP-like tool calls, `SubagentStart`, `SubagentStop`, and transcript paths;
- process stderr/stdout for CLI summary lines such as total token usage;
- Codex transcript/session file referenced by hook payloads;
- Codex config and runtime hook payloads for skills or plugin evidence when present.

Collection rules:

- `llm.model` may come from Codex hook payload `model`.
- `total_tokens` may be parsed from process output when Codex emits a final token summary.
- `total_tokens`, `input_tokens`, `output_tokens`, and `cache_read` may be parsed from Codex local session transcript `token_count` records when present.
- `cache_write` remains unavailable unless Codex exposes explicit cache write usage.
- `total_cost_usd` may be estimated from Codex session transcript token counts when a known OpenAI pricing entry exists.
- `total_cost_usd` remains unavailable unless Codex process output, transcript, app-server evidence, provider API, or a configured pricing source provides enough data.
- `subagents_used` may be derived from `SubagentStart` and `SubagentStop` events.
- `tokens_by_subagent` is unavailable unless a subagent event or transcript contains usage details for that subagent.
- `skills_used` may be derived from Codex skill invocation evidence in transcript or tool/event payloads when present.
- `mcps_used` may be derived from MCP tool names, MCP server status events, transcript records, or Codex process logs when present.

Confidence:

- hook model fields: `measurement_source: native`, `confidence: high`;
- final token summary from Codex process output: `measurement_source: native`, `capture_source: codex_cli_process_output`, `confidence: medium`;
- Codex session transcript token counters: `measurement_source: native`, `capture_source: codex_session_transcript`, `confidence: medium`;
- Codex transcript pricing fallback for known OpenAI models: `measurement_source: estimated`, `capture_source: codex_session_transcript_pricing`, `confidence: medium`;
- transcript-derived subagent/tool/skill/MCP facts: `measurement_source: derived`, `confidence: medium`;
- cost without native billing data: `measurement_source: unavailable`, `confidence: none`.

### Claude Code

Primary sources:

- hook payloads for session id, transcript path, tool usage, MCP tool hooks, subagent events, and model where present;
- Claude Code transcript/session file referenced by hook payloads;
- Claude Code status line JSON, if BMH can install a trial-local status line without mutating global user config;
- Claude Code OpenTelemetry when BMH enables a trial-local exporter;
- process stdout/stderr for final summaries;
- Claude Code SDK session APIs when explicitly configured for local evidence collection.

Collection rules:

- `llm.model` may come from hook payloads, transcript messages, status line JSON, OTel attributes, or SDK session metadata.
- `total_cost_usd` may come from status line JSON, OTel metrics, or transcript/SDK usage records when present.
- `total_tokens` may come from OTel metrics, transcript records, status line JSON, or SDK session messages when present.
- `subagents_used` may be derived from hooks, transcript events, or SDK messages that indicate subagent delegation.
- `llm_by_subagent`, `tokens_by_subagent`, and `cost_by_subagent` may be recorded only when Claude Code exposes usage per subagent. If only aggregate usage is available, per-subagent metrics must be unavailable with reason.
- `skills_used` may be derived from skill invocation evidence in hooks, transcript, or command records.
- `mcps_used` may be derived from MCP tool hook names, transcript tool calls, OTel events, or SDK messages.

Confidence:

- OTel usage metrics emitted by Claude Code: `measurement_source: native`, `confidence: high`;
- status line JSON: `measurement_source: native`, `confidence: medium`;
- transcript usage counters emitted by Claude Code: `measurement_source: native`, `confidence: medium`;
- transcript pricing fallback for known Claude models: `measurement_source: estimated`, `confidence: medium`;
- aggregate-only usage distributed across subagents by heuristic is not allowed in v1.

## Data Model

Add a provider-neutral usage report attached to each trial result.

```json
{
  "usage": {
    "llms": [
      {
        "model": "gpt-5.5",
        "provider": "openai",
        "role": "primary",
        "measurement_source": "native",
        "capture_source": "codex_hook_payload",
        "confidence": "high",
        "evidence_refs": ["hooks.jsonl"]
      }
    ],
    "tokens": {
      "total": {
        "value": 259677,
        "unit": "tokens",
        "measurement_source": "native",
        "capture_source": "codex_cli_process_output",
        "confidence": "medium",
        "evidence_refs": ["process-stderr.txt"]
      },
      "input": null,
      "output": null,
      "cache_read": null,
      "cache_write": null
    },
    "cost": {
      "total_usd": {
        "value": null,
        "unit": "usd",
        "measurement_source": "unavailable",
        "capture_source": "usage_capture",
        "confidence": "none",
        "unavailable_reason": "no native billing or pricing source configured"
      }
    },
    "subagents": [
      {
        "id": "subagent_1",
        "name": "Explore",
        "started_at": "2026-06-21T02:10:00.000Z",
        "ended_at": "2026-06-21T02:11:00.000Z",
        "llms": [],
        "tokens": {
          "total": {
            "value": null,
            "unit": "tokens",
            "measurement_source": "unavailable",
            "capture_source": "subagent_usage_capture",
            "confidence": "none",
            "unavailable_reason": "provider did not expose per-subagent usage"
          }
        },
        "cost": {
          "total_usd": {
            "value": null,
            "unit": "usd",
            "measurement_source": "unavailable",
            "capture_source": "subagent_usage_capture",
            "confidence": "none"
          }
        },
        "evidence_refs": ["hooks.jsonl", "transcript.jsonl"]
      }
    ],
    "skills": [
      {
        "name": "code-review",
        "source": "claude_code",
        "invocation": "explicit",
        "measurement_source": "derived",
        "capture_source": "transcript",
        "confidence": "medium",
        "evidence_refs": ["transcript.jsonl"]
      }
    ],
    "mcps": [
      {
        "server": "github",
        "tool": "pull_request_read",
        "call_count": 3,
        "measurement_source": "derived",
        "capture_source": "hook_events",
        "confidence": "medium",
        "evidence_refs": ["hooks.jsonl"]
      }
    ],
    "coverage": {
      "model": "available",
      "tokens": "partial",
      "cost": "unavailable",
      "subagents": "partial",
      "skills": "partial",
      "mcp": "partial"
    }
  }
}
```

Rules:

- Every metric-like value must include `measurement_source`, `capture_source`, and `confidence`.
- Missing metrics must be represented as unavailable observations, not omitted silently.
- Provider-specific raw records must stay in adapters or artifact files. Domain/application models may store normalized evidence only.
- Do not divide aggregate token or cost totals across subagents unless the provider exposes per-subagent usage.
- Native and estimated metrics must not be summed unless the aggregate explicitly lists component sources.

## Artifact Finalization Contract

Each trial result may reference only files that exist.

Required real-run artifacts:

```text
.bmh/runs/<run-id>/specs/<spec-id>/<harness>/<trial-id>/
  result.json
  process-stdout.txt
  process-stderr.txt
  process-exit.json
```

Conditional artifacts:

```text
  hooks.jsonl          # when hook spool exists
  transcript.jsonl     # when transcript path is available and readable
  diff.patch           # when git diff can be generated
  test-output.txt      # when validation commands run
  usage.json           # when usage capture runs
  artifact-index.json  # always for integrity status
```

`artifact-index.json`:

```json
{
  "artifacts": [
    {
      "ref": "process-stderr.txt",
      "exists": true,
      "bytes": 2564421,
      "sha256": "sha256:...",
      "kind": "process_stderr"
    },
    {
      "ref": "transcript.jsonl",
      "exists": false,
      "kind": "transcript",
      "unavailable_reason": "transcript path was not exposed"
    }
  ]
}
```

Rules:

- `result.json.artifact_refs` must include only existing files.
- Missing optional artifacts must be listed in `artifact-index.json`, not as normal refs.
- Generated artifacts must be redacted before report exposure when they may contain secrets.
- Transcript copying must fail soft unless strict telemetry is enabled.

## Report Contract

Enhance `report.html` with a source-aware observability and comparison experience.

### Report Goal

The primary goal of `report.html` is to help users decide which harness performed better for a selected benchmark scope. The report must make time, cost, and token efficiency easy to compare without reading raw JSON. Users should be able to filter the report, inspect the evidence behind each metric, and understand why a harness is ranked above another.

The comparison experience is a core product requirement. `report.html` must provide an easy visual workflow for comparing harnesses with rankings and charts, so users can quickly explore tradeoffs between execution time, total/relative cost, total token usage, and token efficiency. The report must support interactive "play around" analysis: users should be able to change the ranking dimension, narrow the benchmark scope, and immediately see which harness is best for that selected view.

The report must support interactive exploration:

- filter by harness, spec, tag, status, and comparability status;
- sort rankings by overall score, duration, total cost, total tokens, cost per completed trial, tokens per completed trial, and cost per score point;
- switch between aggregate suite view, per-spec view, and per-trial view;
- show unavailable metrics without hiding the harness from rankings;
- expose source/confidence badges next to each ranked metric;
- keep raw prompts, raw hook payloads, and full transcripts out of inline HTML.

Ranking rules:

- Default ranking should prioritize completed trials, then score, then duration, then cost, then token efficiency.
- A harness with unavailable cost must not be ranked as cheaper than a harness with known cost.
- A harness with unavailable token usage must not be ranked as more token-efficient than a harness with known token usage.
- If cost or token data is unavailable, the report should mark that ranking dimension as `limited` or `unavailable`.
- Users must be able to choose which dimension drives the ranking.
- Rankings must include the number of trials behind each aggregate so single-trial smoke runs are visibly weaker evidence than multi-trial suites.

Charts:

- duration by harness;
- score by harness;
- total tokens by harness when available;
- total cost by harness when available;
- token efficiency, such as tokens per completed trial and tokens per score point, when available;
- cost efficiency, such as cost per completed trial and cost per score point, when available;
- per-spec harness comparison heatmap or table;
- observability coverage by harness;
- artifact integrity by harness/spec.

Charts may be implemented with lightweight inline SVG or a small charting dependency if justified by maintainability and bundle size. The report must remain a standalone HTML artifact that can be opened from the filesystem.

Global report must show:

- harness filter;
- spec filter;
- ranking controls;
- best harness summary for the selected ranking dimension;
- completion/pass rate;
- duration by harness;
- total tokens by harness when available;
- total cost by harness when available;
- token efficiency by harness when available;
- cost efficiency by harness when available;
- LLM/model by harness;
- subagents by harness;
- skills by harness;
- MCP usage by harness;
- observability coverage matrix;
- artifact integrity summary.

Per-trial report must show:

- status and score;
- process duration and exit status;
- LLM/model used;
- total tokens with source/confidence;
- total cost with source/confidence;
- subagents used;
- model/tokens/cost per subagent when available;
- skills used;
- MCP servers/tools used;
- missing usage fields with unavailable reasons;
- artifact links and missing optional artifacts.

Comparability rules:

- If both harnesses completed but one lacks total tokens, mark token comparison as `limited`.
- If both lack cost, mark cost comparison as `unavailable`, not tied.
- If model identities differ, include it as a comparability reason.
- If per-subagent usage is unavailable for either harness, do not compare subagent efficiency.
- Functional pass/fail remains comparable when initial state, spec, validations, and permissions match.

## Architecture

### Domain

Domain may define provider-neutral value objects:

- `MetricObservation`;
- `UsageReport`;
- `UsageCoverage`;
- `ArtifactIndex`;
- `ArtifactIntegrityStatus`.

Domain must not import filesystem, process, CLI, Codex, or Claude Code modules.

### Application

Add ports/use cases:

```text
UsageCapturePort
ArtifactFinalizerPort
TranscriptCollectorPort
RunUsageCaptureUseCase
FinalizeTrialArtifactsUseCase
```

Responsibilities:

- merge usage observations from multiple sources;
- keep evidence references;
- produce unavailable observations with reasons;
- build artifact index;
- update suite summaries and comparability.

### Adapters

Filesystem adapters:

- persist `usage.json`;
- copy/redact transcript evidence;
- write `artifact-index.json`;
- verify artifact refs.

Codex usage adapter:

- parse model from hook payloads;
- parse final token summary from process output;
- derive subagent events from hooks;
- derive MCP/tool usage from hooks and transcript when present;
- leave cost unavailable unless a configured source exists.

Claude Code usage adapter:

- parse model/subagent/tool/MCP evidence from hooks and transcript;
- optionally enable trial-local OTel collection;
- optionally collect status-line JSON only if it can be configured inside the isolated trial without changing global settings;
- leave per-subagent token/cost unavailable unless exposed by native usage evidence.

HTML report adapter:

- render usage and coverage tables;
- render source/confidence badges;
- render artifact integrity;
- avoid rendering raw prompts, secrets, or full transcripts inline.

## Acceptance Tests

Add tests before implementation.

### Artifact Integrity

`tests/acceptance/spec-suite-artifact-finalization.test.ts`

- writes only existing files to `artifact_refs`;
- writes `artifact-index.json` with missing optional artifacts;
- writes `diff.patch` when git diff generation succeeds;
- writes `test-output.txt` when validation commands execute;
- copies `hooks.jsonl` from the trial workspace when hook spool exists;
- fails strict telemetry when required artifacts cannot be collected.

### Usage Capture Contract

`tests/acceptance/usage-report-schema.test.ts`

- accepts normalized model, token, cost, subagent, skill, and MCP usage records;
- rejects metric observations without source/confidence;
- rejects provider-specific raw payloads in domain usage records;
- represents unavailable cost/tokens with reasons.

### Codex Usage Capture

`tests/acceptance/codex-usage-capture.test.ts`

- extracts model from Codex hook payloads;
- extracts total tokens from a Codex process output fixture containing a final token summary;
- extracts model, input tokens, output tokens, cached input tokens, total tokens, and estimated pricing fallback from Codex session transcript fixtures when present;
- records cache write tokens as unavailable when Codex session transcript does not expose them;
- extracts subagent start/stop from Codex hook fixture events;
- extracts MCP usage from Codex hook or transcript fixture events;
- reports cost unavailable when no billing/pricing source exists;
- links every extracted metric to an evidence ref.

### Claude Code Usage Capture

`tests/acceptance/claude-usage-capture.test.ts`

- extracts model from Claude hook, transcript, OTel, or status-line fixtures;
- extracts total tokens and cost from a Claude OTel fixture when present;
- extracts input, output, cache read, cache write, total tokens, native cost, and estimated pricing fallback from Claude transcript fixtures when present;
- extracts subagents from Claude transcript or hook fixtures;
- records per-subagent tokens/cost only when fixture evidence contains native per-subagent usage;
- extracts skills from Claude skill invocation transcript fixtures;
- extracts MCP usage from Claude MCP hook fixtures;
- reports unavailable fields with reasons when neither native usage nor supported pricing evidence exists.

### Suite Aggregation

`tests/acceptance/spec-suite-usage-aggregation.test.ts`

- aggregates total tokens by harness when sources are compatible;
- keeps native and estimated metrics separate;
- aggregates duration from process diagnostics;
- marks cost unavailable when no harness provides cost;
- marks token comparison limited when one harness lacks token data.

### HTML Report

`tests/acceptance/html-report-observability.test.ts`

- renders total tokens, total cost, LLM/model, subagents, skills, and MCP usage sections;
- renders per-subagent model/tokens/cost when available;
- renders unavailable reasons when not available;
- renders source/confidence for every metric;
- renders artifact integrity and links only existing files;
- renders an interactive ranking table for harness comparison;
- renders ranking controls for score, duration, cost, token efficiency, and cost efficiency;
- renders charts for duration, score, tokens, cost, observability coverage, and artifact integrity;
- marks ranking dimensions as limited or unavailable when required metrics are missing;
- does not rank unavailable cost or token metrics as better than known metrics;
- does not inline raw transcripts or raw hook payloads.

## Implementation Plan

1. Add this spec and keep ADR-013 unchanged unless implementation discovers a new architectural decision.
2. Add domain tests for normalized usage and artifact integrity value objects.
3. Add fixture files for Codex hooks/process output/transcript and Claude hooks/OTel/transcript/status-line evidence.
4. Implement provider-neutral usage and artifact models.
5. Implement `ArtifactFinalizerPort` and filesystem adapter.
6. Implement `UsageCapturePort` plus Codex and Claude Code adapters.
7. Wire artifact finalization after harness execution and validation, before suite result persistence.
8. Wire usage capture after process completion and transcript collection.
9. Update suite aggregation and comparability.
10. Update `report.html` rendering.
11. Update README with the new observability coverage model and report fields.
12. Run verification.

## Verification Commands

```bash
npm test
npm run typecheck
npm run build
```

Real smoke validation:

```bash
node ./dist/adapters/inbound/cli/main.js run \
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

- Provider transcripts are useful evidence but may not be stable contracts.
- Token/cost formats can change across harness versions.
- OTel setup for Claude Code must not leak global user telemetry settings into the benchmark.
- Status-line collection must not mutate global Claude settings.
- Skill and MCP evidence can be partial when providers omit explicit invocation metadata.
- Cost comparison is unsafe unless both harnesses expose compatible pricing or native billing data.
- Transcript and hook payloads may contain secrets and must be redacted before report rendering.

## Sources Consulted

- `docs/specs/03-canonical-event-contract.md`
- `docs/specs/05-metrics-and-evaluation.md`
- `docs/specs/09-hook-observability-gap-analysis.md`
- `docs/specs/10-automatic-harness-instrumentation.md`
- `docs/specs/16-spec-catalog-and-suite-reporting.md`
- `docs/specs/19-real-harness-suite-execution-and-diagnostics.md`
- `docs/adrs/013-observability-requires-multiple-sources.md`
- `docs/adrs/014-v1-scope-codex-claude-code.md`
- OpenAI Codex Hooks: https://developers.openai.com/codex/hooks
- OpenAI Codex Skills: https://developers.openai.com/codex/skills
- Anthropic Claude Code Hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Anthropic Claude Code Monitoring: https://code.claude.com/docs/en/monitoring-usage
- Anthropic Claude Code Status Line: https://code.claude.com/docs/en/statusline
- Anthropic Claude Code Subagents: https://code.claude.com/docs/en/sub-agents
- Anthropic Claude Code Skills: https://code.claude.com/docs/en/skills
