---
type: doc
name: tooling
description: Scripts, IDE settings, automation, and developer productivity tips
category: tooling
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---

## Tooling & Productivity Guide

BMH keeps its toolchain deliberately small: TypeScript + `tsc`, Vitest, Zod, Commander, and @clack/prompts. There is no bundler, no separate linter, and no formatter config — the build is a plain `tsc` compilation and the "lint" step is type-checking. Everything is driven through npm scripts defined in [`package.json`](../../package.json). See [development-workflow.md](./development-workflow.md) for how these fit into the SDD + TDD loop.

## Required Tooling

- **Node.js 22+** and **npm** — required runtime (`"engines": { "node": ">=22" }`); the project is native ESM (`"type": "module"`).
- **TypeScript ^5.9** (`devDependency`) — compiler and type checker. Config in [`tsconfig.json`](../../tsconfig.json): `target ES2022`, `module`/`moduleResolution` `NodeNext`, `strict: true`, `esModuleInterop`, `skipLibCheck`, outputs to `dist/`. The `build` script invokes `tsc` directly with explicit flags over the `.ts` files in `src/`.
- **Vitest ^4** (`devDependency`) — the test runner; config in [`vitest.config.ts`](../../vitest.config.ts).
- **git** — required for the product's git-workspace provisioning and for several tests that create checkouts.
- **Runtime dependencies**: `zod ^4` (schemas and JSON contracts), `commander ^14` (CLI), `@clack/prompts ^1.6` (interactive prompts). `@types/node ^22` provides Node typings.

Install everything with `npm install`.

## npm Scripts

- `npm run build` — clean `dist/`, then compile every `src/**/*.ts` with `tsc` to `dist/` (ES2022 / NodeNext / strict).
- `npm run clean` — `rm -rf dist`.
- `npm test` — `vitest run` (full suite once).
- `npm run test:watch` — `vitest` (watch mode).
- `npm run typecheck` — `tsc -p tsconfig.json --noEmit`.
- `npm run lint` — currently identical to `typecheck` (`tsc -p tsconfig.json --noEmit`); there is no ESLint/Prettier.
- `prepack` — runs `npm run build` so the published package ships a fresh `dist/`.

The `bin` mapping `bmh -> dist/adapters/inbound/cli/main.js` is what makes `bmh` available after a global install; from a source build, run `node ./dist/adapters/inbound/cli/main.js <args>`.

## Recommended Automation

- **Pre-push / pre-merge check**: run `npm run typecheck && npm test` before opening a PR; these are the effective CI gates (see [testing-strategy.md](./testing-strategy.md)).
- **TDD watch loop**: keep `npm run test:watch` running while implementing against an acceptance test.
- **No code generation / scaffolding scripts** exist for source; benchmark/spec scaffolding is a *product* feature, not a dev tool — `bmh init` writes `.bmh/specs/suite.json` and `bmh add` writes spec cases. A coding agent can bootstrap a catalog using the prompt in [`docs/prompts/initialize-bmh-spec-catalog-prompt.md`](../../docs/prompts/initialize-bmh-spec-catalog-prompt.md).
- **Local product smoke test (no credentials)**: `bmh run --dry-run` runs a suite against the built-in fake harness, useful for verifying CLI/report changes end-to-end without Codex or Claude Code.

## IDE / Editor Setup

- A TypeScript-aware editor (VS Code or similar) using the workspace `typescript` version gives inline diagnostics matching `npm run typecheck`.
- Because `strict` is on, prefer fixing types at the source rather than `// @ts-ignore`.
- Vitest's globals (`describe`/`it`/`expect`) are enabled via `types: ["node", "vitest/globals"]` in `tsconfig.json`, so no per-file imports of the test API are needed.

## Productivity Tips

- Real Codex / Claude Code smoke runs are opt-in and local-only; never wire them into `npm test`. Use disposable repositories for `bmh run --real`, since the harness is allowed to edit the benchmark checkout.
- Run artifacts land under `.bmh/runs/<run-id>/` (`results.json`, `report.html`, per-trial `result.json`, `hooks.jsonl`, `usage.json`, `artifact-index.json`, process diagnostics) — inspect these directly when debugging a run.
- For OpenAI cost estimation, set `BMH_OPENAI_PRICING_MODE=priority` to switch Codex estimates from Standard to Priority pricing.
- The v1 CLI accepts JSON benchmark files only; YAML is intentionally rejected by `check` and `run --benchmark`.
