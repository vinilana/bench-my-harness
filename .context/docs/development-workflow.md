---
type: doc
name: development-workflow
description: Day-to-day engineering processes, branching, and contribution guidelines
category: workflow
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---

## Development Workflow

BMH is built with **Spec-Driven Development (SDD) + TDD**. Significant work starts as a numbered spec under [`docs/specs/`](../../docs/specs/) and, where it is architecturally significant, an ADR under [`docs/adrs/`](../../docs/adrs/). Acceptance tests are written against the spec **before** the production implementation, then code is added until the suite is green. The full development process, test strategy, acceptance gates, and build-phase plan are recorded in [`CONTRIBUTING.md`](../../CONTRIBUTING.md); this document is the quick operational summary.

The core loop is:

1. Capture the intended behavior in a spec (`docs/specs/NN-*.md`); add or update an ADR if the change is architecturally significant.
2. Write failing acceptance tests in `tests/acceptance/` that encode the spec's observable contract.
3. Implement domain, then application use cases/ports, then adapters — keeping provider-specific code behind ports.
4. Make the suite green: `npm test` and `npm run typecheck` must both pass.
5. Update the README and relevant docs so documented flows match executable behavior (this is an explicit acceptance gate).

## Branching & Releases

- Trunk is `main`; merge to `main` is via pull request (recent history shows merged PRs such as `release/0.3.0` and `fix/cli-add-spec`).
- Use short topic branches named by intent: `feature/...`, `fix/...`, `release/x.y.z`.
- Releases are tagged/committed as `Release vX.Y.Z` and merged through a `release/x.y.z` PR; the package version lives in `package.json` (currently `0.4.0`) and changes are logged in `CHANGELOG.md`.
- `prepack` runs `npm run build`, so the published npm package always ships a fresh `dist/`.
- Do not commit `dist/` or `.bmh/` run artifacts; they are build/run outputs.

## Local Development

- Install: `npm install`
- Build (clean + compile `src/` to `dist/`): `npm run build`
- Run the CLI from a source build: `node ./dist/adapters/inbound/cli/main.js <args>` (equivalent to `bmh <args>` when installed globally)
- Type-check without emitting: `npm run typecheck`
- Lint (currently `tsc -p tsconfig.json --noEmit`): `npm run lint`
- Test once: `npm test` — Watch: `npm run test:watch`
- Quick no-credentials smoke of the product itself: `bmh init ...` then `bmh run --dry-run --run-id local_suite_001` and open `.bmh/runs/local_suite_001/report.html`.

## Code Review Expectations

Reviews check the [acceptance gates from `CONTRIBUTING.md`](../../CONTRIBUTING.md), specifically:

- All tests pass and the build type-checks (`npm test` + `npm run typecheck`).
- Hexagonal boundaries hold: core (`src/domain`, `src/application`) must not import Codex- or Claude-specific packages or schemas; provider behavior stays behind ports. This is guarded by `tests/acceptance/architecture-boundaries.test.ts`.
- Canonical event schemas reject invalid payloads; every normalized event references a raw event.
- Codex/Claude hook installers only write inside the trial workspace; the runner installs and uninstalls hooks per trial.
- `hook-capture` preserves events through spool fallback.
- Usage metrics always declare source and confidence; the comparability policy refuses incompatible runs; redaction removes known secrets before reports.
- README commands and documented flows match executable behavior (`tests/acceptance/readme-gates.test.ts` exists to enforce this).
- New behavior arrives with tests written first, and an ADR is added/updated for architecturally significant changes.

The v1 suite must **never** call real Codex or Claude Code; use fakes and process-controlled harnesses instead.

## Onboarding Tasks

Start by reading [`docs/specs/00-project-charter.md`](../../docs/specs/00-project-charter.md), [`docs/specs/02-hexagonal-architecture.md`](../../docs/specs/02-hexagonal-architecture.md), and [`docs/specs/11-tdd-acceptance-test-plan.md`](../../docs/specs/11-tdd-acceptance-test-plan.md), plus ADRs `001` (hexagonal), `002` (canonical event schema), and `005` (token measurement confidence). Then run `npm test`, skim a use case in `src/application/use-cases/`, and trace its acceptance test in `tests/acceptance/`. See [testing-strategy.md](./testing-strategy.md) and [tooling.md](./tooling.md) for details.
