# Changelog

All notable changes to Bench My Harness are documented in this file.

This project follows semantic versioning during the v0 phase: minor versions may add or adjust CLI behavior while the public contracts are still stabilizing.

## [Unreleased]

## [0.2.0] - 2026-06-21

### Changed

- Redesigned the public CLI around workflow-first commands:
  - `bmh init`
  - `bmh add`
  - `bmh import`
  - `bmh doctor`
  - `bmh run`
  - `bmh smoke`
  - `bmh report`
  - `bmh benchmark ...`
- Moved standalone benchmark JSON operations under `bmh benchmark`.
- Moved hook ingestion to the hidden `bmh internal hook-capture` command used by generated harness instrumentation.
- Folded bulk Git draft creation into `bmh add --from-git --range`.
- Updated README, specs, prompt docs, and acceptance tests to use the new command surface.

### Added

- Added `bmh doctor` to validate the local spec catalog and report Codex/Claude Code executable readiness.

### Removed

- Removed legacy public command paths instead of keeping compatibility aliases:
  - `bmh specs ...`
  - `bmh init benchmark`
  - `bmh validate benchmark`
  - top-level `bmh run --benchmark ...`
  - top-level `bmh hook-capture`

### Verified

- Automated verification:
  - `npm test`: 72 test files, 270 tests passing.
  - `npm run typecheck`: passing.
  - `npm run build`: passing.
- Packaging verification:
  - `npm pack --dry-run`: package contents verified for `bench-my-harness@0.2.0`.

## [0.1.0] - 2026-06-21

First release of Bench My Harness, focused on local, reproducible benchmark execution for Codex and Claude Code.

### Added

- CLI entrypoint with the `bmh` binary and `hook-capture`, `validate`, `run`, `specs`, and `report` commands.
- Hexagonal architecture foundation with domain, application ports, inbound adapters, and outbound adapters separated by tests.
- Versioned JSON benchmark schema with validation for repository refs, prompts, setup commands, validation commands, expected outputs, limits, and scoring.
- Markdown prompt-file support through `prompt.file`, including path-safety checks and prompt resolution before harness execution.
- Local `.bmh/specs` catalog workflow for creating, importing, validating, backfilling, and running feature specs as benchmark suites.
- Backfill workflow for creating backward-looking benchmark specs from git history, with a default limit of 25.
- Isolated benchmark workspaces for comparable runs against `base_ref` and `golden_ref`.
- Real harness process execution for Codex and Claude Code, including prompt delivery over stdin and per-trial timeout handling.
- Temporary project-local hook installation for Codex and Claude Code without mutating global user configuration.
- Raw hook event capture through stdin and spool files, with canonical event normalization and reprocessing support.
- Validation command execution after harness runs, including captured validation output and benchmark scoring.
- Per-trial artifact finalization with hooks, transcripts, process stdout/stderr, process exit metadata, diffs, validation output, usage data, and artifact indexes.
- Provider transcript resolution for Codex and Claude Code session JSONL files with identity checks before trusting usage evidence.
- Best-effort usage capture for Codex:
  - model detection from hook payloads and transcripts;
  - native input, output, cached input, and total token capture from session transcript `token_count` records;
  - estimated OpenAI cost for explicitly supported known models;
  - Standard/Priority OpenAI pricing mode support through `BMH_OPENAI_PRICING_MODE`.
- Best-effort usage capture for Claude Code:
  - model detection from status-line JSON, hook payloads, and local transcripts;
  - native input, output, cache read, cache write, and total token capture from transcript usage records;
  - transcript deduplication to avoid double-counting repeated assistant records;
  - native cost when exposed by Claude Code transcript data;
  - estimated cost for explicitly supported known Claude models.
- Usage observations with `measurement_source`, `capture_source`, `confidence`, and evidence references.
- Report generation as JSON, Markdown, and static redacted `report.html`.
- Suite `report.html` with harness ranking controls, score/duration/token/cost charts, usage coverage, artifact integrity, model usage, subagent usage, skills, MCP usage, and source/confidence badges.
- Comparability policy that avoids ranking missing token or cost evidence as better than known values.
- Local HTTP ingest adapter with HMAC, timestamp, nonce, provider, and payload-size validation.
- Project documentation:
  - README with getting started and real-harness workflows;
  - product specs;
  - ADRs;
  - implementation coverage notes;
  - prompts for initializing BMH-style specs.
- Agent skills for BMH planning, review, ADR authoring, benchmark spec authoring, harness adapter design, and telemetry analysis.

### Changed

- Reframed v1 "non-goals" as roadmap phases, keeping Cursor, OpenCode, Pi, distributed execution, public leaderboard, and dashboard workflows visible as future work.
- Replaced ad hoc benchmark prompt entry with spec-driven benchmark catalogs that can use Markdown specs as primary input.
- Improved OpenAI pricing representation by storing prices as USD per 1M tokens and converting during cost calculation.
- Tightened OpenAI model pricing resolution so unknown model variants remain unavailable instead of being priced by partial string matching.

### Fixed

- Interactive benchmark initialization no longer requires all values to be pre-supplied when running `init benchmark`.
- Local repository paths can be used for benchmark creation instead of requiring only fixture or `file://` URL inputs.
- Real suite reports now include run artifacts and report links consistently under `.bmh/runs/<run-id>`.
- Usage capture now records unavailable reasons instead of silently omitting unsupported token, cost, context, subagent, skill, or MCP fields.
- Report rankings now treat unavailable cost/token data as limited rather than best-performing.

### Verified

- Automated verification:
  - `npm test`: 72 test files, 267 tests passing.
  - `npm run typecheck`: passing.
  - `npm run build`: passing.
- Real local smoke validation through the compiled CLI:
  - Ran `.bmh/specs` spec `benchmark-prompt-files` with Codex and Claude Code using `node ./dist/adapters/inbound/cli/main.js`.
  - Codex completed successfully and produced model, token, and estimated cost usage evidence.
  - Claude Code execution reached the local session limit, but BMH still captured model and token usage from transcript evidence before the harness failed.

### Known Limitations

- v1 production support is limited to Codex and Claude Code.
- Cursor, OpenCode, Pi, distributed execution, public leaderboards, dashboards, CSV export, and CI gates are roadmap items.
- Benchmark files are JSON-only; YAML is rejected until a future parser is added.
- Real harness smoke tests require local binaries, authentication, account limits, and explicit opt-in.
- Context-window usage is not yet captured as a first-class metric.
- Cost is reported only when native cost evidence exists or an embedded pricing entry matches the model exactly.
- Per-subagent token and cost attribution is unavailable unless the provider exposes native per-subagent usage evidence.
- Durable database storage is not included in this release; v1 uses filesystem stores for catalogs, reports, runs, and artifacts.
