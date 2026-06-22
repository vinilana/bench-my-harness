---
type: skill
name: Refactoring
description: Refactor BMH safely without changing behavior, preserving hexagonal port boundaries and stable schema/CLI contracts. Use when improving structure, reducing duplication, or simplifying logic.
skillSlug: refactoring
phases: [E]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---
## Workflow

1. Establish a green baseline before touching anything: `npm run typecheck && npm test`. A refactor that starts from red is not a refactor.
2. Identify the contract you must not change. Behavior is pinned by Zod schemas (`src/domain/.../*-schema.ts`, `normalized-event.ts`, `metric-observation.ts`), the CLI surface (`src/adapters/inbound/cli/main.ts`, asserted by `tests/acceptance/cli-public-surface.test.ts`), persisted artifact shapes under `.bmh/runs/...`, and the documented README behavior. Keep all of these byte-stable unless the task is explicitly to change them.
3. Respect the port boundaries. When moving code, keep `domain`/`application` free of `adapters/` and provider imports and free of `node:fs|path|child_process|http`; keep provider behavior behind its port interface in `src/application/ports/`. If a refactor wants to import across the boundary, the design — not the boundary — is wrong. `tests/acceptance/architecture-boundaries.test.ts` is the guardrail.
4. Keep the interactive seam intact: logic depends on the `Prompter` interface (`prompter.ts`); `@clack/prompts` stays isolated in `clack-prompter.ts`; tests keep driving `ScriptedPrompter`. Don't collapse these layers for brevity.
5. Refactor in small steps, re-running the focused suite (`npx vitest run tests/acceptance/<area>.test.ts`) after each, then the full `npm test`. Prefer extracting shared helpers (e.g. into `src/adapters/outbound/usage/usage-capture-helpers.ts` for usage logic) over inlining duplication.
6. Finish with all three gates green: `npm run typecheck`, `npm test`, `npm run build`. Commit as `refactor:` (see the `commit-message` skill) with no behavior change in the same commit.

## Examples

Safe move — consolidate duplicated pricing math behind the existing helper, keeping the port and the public exports stable:

```typescript
// before: cost math inlined in both codex-usage-capture.ts and claude-code-usage-capture.ts
// after: both call the shared, source/confidence-aware helpers
import { calculateOpenAiCostUsd } from "./openai-pricing.js";
import { calculateClaudeCostUsd } from "./claude-pricing.js";
// behavior identical: native > estimated, unknown models stay unavailable
```

Unsafe move to reject: "simplify" by having `RunSpecSuiteUseCase` construct `CodexUsageCapture` itself — that deletes the port seam and breaks `architecture-boundaries.test.ts`.

## Quality Bar

- No behavior change: the same tests that passed before pass after, unchanged. If a test must change, it is no longer a pure refactor — split it out.
- Contracts stay stable: event/metric/benchmark/report schemas, the CLI public surface, persisted artifact shapes, and documented flows are unchanged unless explicitly in scope.
- Port boundaries preserved; no new cross-layer or provider imports; no forbidden Node builtins in domain/application.
- Usage honesty preserved verbatim: native outranks estimated, counts never silently mixed, unknown models unavailable.
- Every step is reversible and re-tested; never refactor past a failing intermediate state and "fix it later".

## Resource Strategy

- Lean on the existing fakes and fixtures (`tests/support/`) to pin behavior during the move; do not write new ad-hoc harnesses.
- Extract shared logic into the layer that already owns it (domain helpers, `usage-capture-helpers.ts`) rather than creating new top-level modules.
- No scripts or references in this skill folder; the safety net is the test suite plus the architecture-boundary test.
