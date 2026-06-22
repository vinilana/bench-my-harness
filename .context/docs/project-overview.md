---
type: doc
name: project-overview
description: High-level overview of the project, its purpose, and key components
category: overview
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---

## Project Overview

Bench My Harness (BMH) is a benchmark and observability harness for comparing agentic coding tools under controlled, repeatable conditions. It runs the same coding task against different harnesses — **Codex** and **Claude Code** in v1 — instruments each run, and turns the comparison into reproducible numbers (time, cost, tokens, passing tests) with an explicit source and confidence on every metric. The audience is anyone tuning an agent setup (skills, workflows, context, model) who needs evidence, not vibes, that a change actually helped.

## Codebase Reference

> **Semantic Snapshot**: Use `context({ action: "getMap", section: "all" })` for the generated stack, architecture layers, key files, and dependency hotspots. Design rationale lives in ADRs under [`docs/adrs/`](../../docs/adrs/) and detailed specs under [`docs/specs/`](../../docs/specs/).

## Quick Facts

- Root: `/home/aicoders/workspace/bench-my-harness`
- Package: `bench-my-harness` (v0.4.0), CLI binary `bmh`
- Language/runtime: TypeScript on Node.js 22+, ESM (`"type": "module"`)
- CLI entry: `dist/adapters/inbound/cli/main.js` (compiled from `src/adapters/inbound/cli/main.ts`)
- Build output: `dist/` via `tsc`
- Architecture: hexagonal (domain / application / adapters)
- Key libraries: Zod (schemas/contracts), Commander (CLI), @clack/prompts (interactive UI)
- Semantic snapshot: `context({ action: "getMap", section: "all" })`

## Entry Points

- `src/adapters/inbound/cli/main.ts:172` — `buildProgram`, the Commander program assembling all CLI commands. This is the compiled `bmh` binary.
- `src/adapters/inbound/cli/hook-capture.ts` — the `bmh internal hook-capture` command that harness hooks call with one JSON event on stdin.
- `src/adapters/inbound/http/` — local HTTP ingest endpoint (HMAC / timestamp / nonce verified) for receiving hook events over the network.

The top-level CLI commands are `init`, `add`, `check`, `run`, `report`, and the hidden `internal hook-capture`.

## Key Exports

- `BenchmarkRunner` (`src/application/use-cases/run-benchmark.ts:104`) — orchestrates a single benchmark across trials: provision workspace, install hooks, run harness, validate, capture usage, finalize artifacts, uninstall hooks.
- `RunSpecSuiteUseCase` / `RunSpecSuiteSmokeUseCase` (`src/application/use-cases/run-spec-suite*.ts`) — run a whole `.bmh/specs` catalog (real or fake/dry-run).
- `Benchmark`, `BenchmarkCategory`, `SpecCatalog` (`src/domain/benchmark/benchmark-schema.ts`) — Zod-backed v1 JSON benchmark and catalog contracts.
- `NormalizedEvent`, `CanonicalEventType` (`src/domain/events/normalized-event.ts`) — the versioned canonical event schema all raw hook events normalize into.
- `MetricObservation`, `MeasurementSource`, `MeasurementConfidence` (`src/domain/metrics/metric-observation.ts`) — every metric carries source and confidence.
- `ComparisonDecision` (`src/domain/comparison/compare-runs.ts`) — the comparability policy that refuses incompatible runs.
- `buildSuiteReport` / `SuiteReport` (`src/domain/reports/suite-report.ts`) and `BenchmarkReport` (`src/domain/reports/report-model.ts`) — report models behind JSON / Markdown / HTML export.
- Adapters: `CodexHookInstaller`, `ClaudeCodeHookInstaller`, `ProcessHarnessRunner`, `ClaudeCodeUsageCapture`, `CodexUsageCapture`, and the `Prompter` seam (`ClackPrompter` for TTY, `ScriptedPrompter` for tests).

## File Structure & Code Organization

- `src/domain/` — pure domain models and rules: `benchmark/`, `events/`, `metrics/`, `evaluation/`, `comparison/`, `harnesses/`, `reports/`, `artifacts/`, `security/`. No I/O, no provider packages.
- `src/application/` — `use-cases/` (orchestration) and `ports/` (the interfaces adapters implement). The application layer depends only on ports, never on concrete adapters.
- `src/adapters/inbound/` — driving adapters: `cli/` (Commander program, prompters, hook-capture) and `http/` (local ingest).
- `src/adapters/outbound/` — driven adapters: `harnesses/` (Codex + Claude Code hook installers, process runners, capability matrices), `filesystem/`, `git/`, `storage/`, `usage/` (transcript capture + pricing).
- `tests/` — `acceptance/` (the bulk of the suite, written before implementation), `fixtures/` (benchmarks, transcripts, git history, spec catalogs), `support/` (fakes and helpers).
- `docs/` — `adrs/` (15 design decisions), `specs/` (26 numbered specs), `prompts/`, `assets/`.
- `dist/` — compiled output (git-ignored, produced by `npm run build`).

## Technology Stack Summary

BMH is a CLI-first TypeScript application targeting Node.js 22+ with native ESM. The build is a plain `tsc` compilation of `src/` to `dist/` (no bundler). Runtime contracts and JSON validation use Zod; the CLI is built on Commander; interactive authoring uses @clack/prompts behind a `Prompter` port. Testing is done with Vitest. Linting is currently `tsc --noEmit` (type-checking as the lint gate) — there is no separate ESLint or Prettier configuration. The stack is intentionally minimal so the tool ships quickly and processes JSON hook payloads with low ceremony; a native `hook-capture` binary can be introduced later if hook latency becomes a measured problem.

## Core Framework Stack

There is no web or UI server framework. The "framework stack" is the hexagonal layering itself: domain logic is provider-agnostic, the application layer wires use cases against ports, and provider behavior (Codex / Claude Code specifics, filesystem, git, HTTP) lives entirely in adapters. This boundary is enforced by `tests/acceptance/architecture-boundaries.test.ts`, which fails the build if core code imports provider-specific packages or reaches across layers.

## UI & Interaction Libraries

The only "UI" is the terminal. @clack/prompts powers rich interactive flows (`bmh add` and `bmh init` with no flags). All interactive logic depends on the `Prompter` interface in `src/adapters/inbound/cli/prompter.ts`, with two implementations: `ClackPrompter` (real TTY) and `ScriptedPrompter` (deterministic, used by tests and non-TTY piped input). HTML reports are generated as static, self-contained, redacted `report.html` files — no client framework.

## Development Tools Overview

Day-to-day work uses npm scripts: `npm run build`, `npm test`, `npm run test:watch`, `npm run typecheck`, and `npm run lint`. See [tooling.md](./tooling.md) for the full toolchain and [development-workflow.md](./development-workflow.md) for the SDD + TDD loop.

## Getting Started Checklist

1. Ensure Node.js 22+ is installed.
2. Install dependencies with `npm install`.
3. Build the CLI with `npm run build` (outputs `dist/`).
4. Run the test suite with `npm test` to confirm a healthy checkout.
5. Try the no-credentials path: in a git repo, `node ./dist/adapters/inbound/cli/main.js init --repo-path . --test-command "npm test" --harness codex`, then `... run --dry-run --run-id local_suite_001`, and open `.bmh/runs/local_suite_001/report.html`.
6. Read [development-workflow.md](./development-workflow.md) before making changes.

## Next Steps

v1 scope is a local, reproducible benchmark workflow for Codex and Claude Code. Future phases (see [`docs/specs/08-initial-roadmap.md`](../../docs/specs/08-initial-roadmap.md) and the README roadmap) include Cursor / OpenCode / Pi adapters, distributed execution, a public leaderboard, CI gates, and project-command generation beyond Node.js. Real harness execution is always opt-in and is never part of `npm test`.
