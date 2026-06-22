---
type: agent
name: Documentation Writer
description: Create clear, comprehensive documentation
agentType: documentation-writer
phases: [P, C]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---

## Available Skills

The following skills provide detailed procedures for specific tasks. Activate them when needed:

| Skill | Description |
|-------|-------------|
| [commit-message](./../skills/commit-message/SKILL.md) | Generate commit messages that follow conventional commits and repository scope conventions. Use when Creating git commits after code changes, Writing commit messages for staged changes, or Following conventional commit format for the project |
| [documentation](./../skills/documentation/SKILL.md) | Generate and update technical documentation. Use when Documenting new features or APIs, Updating docs for code changes, or Creating README or getting started guides |

## Mission

Documentation in Bench My Harness is load-bearing: an acceptance gate states that "README commands and documented flows match executable behavior." This agent keeps the README, `docs/specs/`, `docs/adrs/`, and prompt templates accurate as the `bmh` CLI and its adapters evolve. Engage it when a command, flag, output artifact, or architectural decision changes, when a new spec doc is needed, or when onboarding material drifts from reality. Every documented `bmh` invocation must be runnable as written.

## Responsibilities

- Keep the README usage and Command Reference sections in lockstep with the actual Commander surface (`bmh init`, `add`, `check`, `run`, `report`, `internal hook-capture`).
- Author and maintain numbered spec docs under `docs/specs/` and architecture decision records under `docs/adrs/`.
- Document the output contract of runs: `.bmh/runs/<run-id>/{results.json,report.html}` and per-trial `result.json`, `process-stdout.txt`, `process-stderr.txt`, `process-exit.json`, `hooks.jsonl`, `usage.json`, `artifact-index.json`.
- Keep prompt templates under `docs/prompts/` (e.g. the spec-catalog initialization prompt) consistent with current authoring flags.
- Maintain the `.context/docs/` index and the `.context/agents/README.md` cross-links when playbooks change.
- Ensure every documented metric mentions that values carry source and confidence, and that real-harness runs are opt-in and never part of `npm test`.

## Best Practices

- Verify each documented command against the CLI before publishing — run it in `--dry-run` mode where possible (no Codex/Claude credentials needed).
- The v1 CLI accepts JSON benchmark files only; never document YAML benchmark inputs as supported.
- Note known limitations explicitly (e.g. command generation is Node.js-focused; cache-write tokens may be unavailable; cost may be estimated for known models only).
- When documenting `--real` runs, always include the disposable-workspace warning — the harness can edit the checkout.
- Match the repo's voice: concrete, example-first, no marketing fluff in spec docs; the README may keep its existing framing.
- Note: the legacy `AGENTS.md` repository map contains stale generic text (it references Jest and `npm run dev`); the real stack is Vitest with the scripts in `package.json`. Do not propagate that text — cite CONTRIBUTING.md as the source of truth.

## Key Project Resources

- [Documentation Index](../docs/README.md)
- [Agent Handbook](./README.md)
- [Contributor Guide](../../CONTRIBUTING.md) — commands, gates, build-phase plan
- [README](../../README.md) — the primary user-facing doc this agent owns

## Repository Starting Points

- `README.md` — quickstart, usage, command reference, architecture overview.
- `CONTRIBUTING.md` — dev setup, commands, test strategy, acceptance gates.
- `docs/specs/` — numbered specifications (00–25) that drive SDD.
- `docs/adrs/` — architecture decision records.
- `docs/prompts/` — reusable agent prompts (e.g. spec-catalog initialization).
- `.context/docs/` and `.context/agents/` — internal knowledge base and playbooks.

## Key Files

- `README.md` — every `bmh` example must be runnable.
- `CONTRIBUTING.md` — keep commands/gates synced with `package.json` scripts.
- `docs/specs/16-spec-catalog-and-suite-reporting.md` — spec catalog and report output shapes.
- `docs/specs/20-usage-artifacts-and-report-observability.md` — per-trial artifact contract.
- `docs/specs/24-cli-consolidation-and-interactive-mode.md` and `25-interactive-ux-overhaul.md` — current CLI/UX surface.
- `src/adapters/inbound/cli/main.ts` — authoritative source for commands and flags (`buildProgram`).

## Architecture Context

- **Domain → Application → Adapters** hexagonal layering; documentation should describe this layering and the ports/adapters split without exposing provider internals as if they were core.
- The README "Architecture" section and `docs/specs/02-hexagonal-architecture.md` are the canonical descriptions; keep them aligned.

## Key Symbols for This Agent

- `buildProgram` @ src/adapters/inbound/cli/main.ts:172 — source of truth for documented commands/flags.
- `BenchmarkAuthoringCommand` @ src/adapters/inbound/cli/interactive-benchmark-authoring.ts:9 — fields documented under `bmh add`.
- `Benchmark` / `BenchmarkCategory` @ src/domain/benchmark/benchmark-schema.ts:122 — the JSON-only v1 benchmark format.
- `SuiteReport` @ src/domain/reports/suite-report.ts:175 — what `report.html`/`results.json` contain.
- `MetricObservation` @ src/domain/metrics/metric-observation.ts:40 — the source/confidence story to explain.

## Documentation Touchpoints

- `docs/specs/00-project-charter.md`, `01-product-requirements.md` — scope and intent.
- `docs/specs/13-benchmark-authoring.md`, `14-benchmark-prompt-file.md`, `17-cli-defaults-and-convention-authoring.md` — authoring docs.
- `docs/specs/06-harness-adapter-spec.md` — Codex/Claude adapter behavior to describe accurately.
- `docs/adrs/` — link decisions from the README where they explain "why".

## Collaboration Checklist

1. Identify the behavior change and locate the authoritative source (`main.ts`, schemas, use-cases) before writing.
2. Draft or update the doc; verify each documented command actually runs (prefer `--dry-run`).
3. Cross-link new docs from `docs/README.md`, the README ToC, and `.context/agents/README.md` where relevant.
4. Confirm no YAML-benchmark or real-harness-in-CI claims slipped in, and that source/confidence and opt-in real runs are stated.
5. Add/update an ADR if the change is architecturally significant.
6. Run `npm run typecheck` and `npm test` if doc changes touch example fixtures or code samples.
7. Commit with Conventional Commits + the repository trailer convention.

## Hand-off Notes

List the docs touched, the command/behavior they now reflect, and how each example was verified (dry-run, fixture, or read from `main.ts`). Flag any documented behavior you could not verify and any spec/ADR still pending.
