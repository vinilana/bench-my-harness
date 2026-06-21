# Contributing to Bench My Harness

Thanks for your interest in BMH. This document covers the development workflow, test strategy, acceptance gates, and the build-phase plan. For user-facing documentation, see the [README](./README.md).

## Development setup

```bash
git clone https://github.com/vinilana/bench-my-harness.git
cd bench-my-harness
npm install
npm run build
npm test
```

Requires Node.js 22+.

## Commands

```bash
npm test          # run the full Vitest suite once
npm run test:watch # run Vitest in watch mode
npm run typecheck # type-check without emitting
npm run lint      # type-check (lint is currently tsc --noEmit)
npm run build     # clean and compile src/ to dist/
```

## Stack

- TypeScript on Node.js 22+
- Vitest for TDD
- Zod for runtime schemas and JSON contracts
- Commander for the CLI

This stack optimizes for a CLI-first product that processes JSON hook payloads, validates versioned schemas, and can ship quickly. A native `hook-capture` binary can be introduced later if hook latency becomes a measured problem.

## Test strategy

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

### Real harness smoke tests

Real Codex and Claude Code smoke tests are local-only checks for maintainers with the required binaries, credentials, and disposable repositories. They are **not** acceptance tests, are **not** required for CI, and must **not** run as part of `npm test`. See the [Validate and run a spec suite](./README.md#validate-and-run-a-spec-suite) section of the README for the `bmh run --real` workflow.

## Acceptance gates

The implementation is not acceptable until:

- all tests pass;
- canonical event schemas reject invalid payloads;
- every normalized event references a raw event;
- Codex and Claude hook installers only write inside the trial workspace;
- `hook-capture` preserves events through spool fallback;
- the benchmark runner installs and uninstalls hooks per trial;
- usage metrics always declare source and confidence;
- the comparability policy refuses incompatible runs;
- redaction removes known secrets before reports;
- README commands and documented flows match executable behavior.

## Build-phase plan

The implementation order BMH was built in:

1. Define contracts and failing tests.
2. Implement domain schemas and normalization.
3. Implement local raw and normalized event stores.
4. Implement `hook-capture`.
5. Implement Codex and Claude Code hook installers.
6. Implement the benchmark runner with fake-harness tests.
7. Implement usage capture interfaces and best-effort collectors.
8. Generate reports.
9. Add local spec catalogs and static HTML suite reports.
10. Add opt-in local-only real-harness smoke tests.
11. Revisit Cursor, OpenCode, and Pi adapters.

## Architecture

BMH follows hexagonal architecture. Core code must not import Codex- or Claude-specific packages or schemas directly; provider-specific behavior belongs behind ports. Design decisions are recorded as ADRs in [`docs/adrs/`](./docs/adrs/). Please add or update an ADR when making an architecturally significant change.
