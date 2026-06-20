# Implementation Coverage Matrix

This file tracks executable coverage against the current specs. It is not a replacement for tests; it is a working checklist for finishing the v1 implementation without shrinking the scope accidentally.

## Status Legend

- `done`: implemented and covered by automated tests.
- `partial`: implemented in part, or covered only by narrow tests.
- `pending`: not implemented yet.
- `future`: explicitly outside v1 scope.

## Product Requirements

| Requirement | Status | Evidence / Next Work |
| --- | --- | --- |
| Register harnesses with name, type, version, command, and capabilities | done | `RegisterHarnessUseCase`, health check ports, and acceptance tests. |
| Register versioned benchmarks | partial | `BenchmarkSchema` and JSON-only v1 CLI validation exist; durable benchmark catalog and YAML parsing remain future storage work. |
| Run benchmarks with multiple trials per harness | done | `BenchmarkRunner.runBenchmark` orchestration and acceptance tests cover Codex + Claude Code with repeated trials. |
| Capture events via local hooks and stdin | done | `runHookCapture`, hook installers, acceptance tests. |
| Capture events via file/import | done | JSON/JSONL import use case and acceptance tests. |
| Install temporary hooks per trial for Codex and Claude Code | done | Codex and Claude Code installers, acceptance tests. |
| Persist raw events, normalized events, metrics, artifacts, and report state | done | In-memory stores and persistence flow acceptance tests. Durable disk/database storage remains outside this iteration. |
| Calculate success, score, tools, output, token/context placeholders, and reportable metrics | done | Phase 3 metrics/evaluation/report acceptance tests. |
| Compare only sufficiently compatible runs | done | `compareRuns`, report model, and report export tests. |
| Export reports | done | JSON and Markdown export tests, redacted by default. |

## Roadmap Coverage

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 0 - Foundation | done | Specs, ADRs, README, tests, initial core implemented. |
| Phase 1 - Ingestion and normalization | done | Raw storage, normalized storage, stdin hook capture, file import, reprocessing, and expanded lifecycle normalization covered by tests. |
| Phase 2 - Benchmark runner | partial | Multi-trial runner, isolated workspaces, hook install/uninstall, artifacts, process runner, CLI process mode, validation command execution, and CLI validation execution are covered. Real harness smoke tests remain opt-in/future. |
| Phase 3 - Metrics and evaluation | done | Derived metrics, scoring, statistics, comparability-aware reports, and JSON/Markdown export covered by tests. |
| Phase 4 - Additional adapters | future | Cursor, OpenCode, Pi outside v1; local HTTP ingest can be implemented as adapter infrastructure. |
| Phase 5 - Product | future | UI/API/dashboard/CI gates after v1 CLI/reporting. |

## V1 Completion Checklist

- CLI has executable `bench-my-harness hook-capture`, `validate benchmark`, `run`, and `report` commands.
- JSON/JSONL import preserves raw events and reports invalid lines deterministically.
- Raw events can be reprocessed into a normalized event store.
- Normalized event and metric stores enforce idempotency.
- Harness profiles can be registered and health checked.
- Process runner can execute configured harness commands with prompt, workspace, env, and timeout.
- Usage capture records unavailable data with source and confidence, and native/estimated values are never mixed silently.
- Metric calculation covers tools, output artifacts, token/context placeholders, timing, and failures.
- Evaluation score uses documented weights and preserves evidence.
- Reports export JSON and Markdown without raw secrets by default.
- Local HTTP ingest verifies HMAC, timestamp, nonce, provider, and payload size.
- Domain modules do not import application, adapters, CLI, filesystem, process APIs, or provider schemas.
- v1 production code contains only Codex and Claude Code providers.

## Current Verification Snapshot

- `npm test`: 30 files, 117 tests passing.
- `npm run typecheck`: passing.
- `npm run build`: passing.
- Production provider scope remains Codex and Claude Code.

## Remaining Non-Blocking Gaps

- Real Codex and Claude Code checks are future opt-in local-only smoke tests and require local binaries/credentials; they are not part of `npm test`.
- Durable database/filesystem stores are not implemented; v1 currently uses in-memory stores plus local hook spool/artifact files.
- YAML benchmark parsing is not implemented; JSON-only v1 accepts JSON benchmarks and rejects `.yml` and `.yaml` benchmark files explicitly.
- UI, dashboard, CSV export, CI gates, Cursor, OpenCode, and Pi remain future phases.
