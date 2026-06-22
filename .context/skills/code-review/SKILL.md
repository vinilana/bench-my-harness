---
type: skill
name: Code Review
description: Review BMH code for quality, hexagonal boundaries, and the project's acceptance gates. Use when reviewing a diff before commit or checking adherence to BMH conventions. Pairs with /code-review.
skillSlug: code-review
phases: [R, V]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---
## Workflow

1. Confirm the change is test-first. BMH is TDD/SDD — there should be a test that asserts the new behavior, and it should have been failing before the implementation. A production change with no accompanying test is a finding.
2. Check the architecture boundary. Core code (`src/domain/`, `src/application/`) must not import provider-specific packages/schemas or the `adapters/` layer; provider behavior belongs behind a port in `src/application/ports/`. Domain and application use-cases must not import `node:fs`, `node:path`, `node:child_process`, or `node:http`. These are enforced by `tests/acceptance/architecture-boundaries.test.ts` — flag any new import that would break it.
3. Walk the acceptance gates relevant to the diff (from CONTRIBUTING "Acceptance gates"):
   - canonical event schemas reject invalid payloads;
   - every normalized event references a raw event (`raw_ref`);
   - Codex/Claude hook installers write only inside the trial workspace and clean up without touching unrelated files;
   - `hook-capture` preserves events via spool fallback;
   - the runner installs and uninstalls hooks per trial;
   - every usage metric declares `measurement_source`, `capture_source`, and `confidence`;
   - the comparability policy refuses incompatible runs;
   - redaction removes known secrets before reports;
   - README/docs match executable behavior.
4. Verify usage and pricing honesty: native values must outrank estimates, native and estimated token counts must never be silently mixed, and unknown models must stay unavailable rather than priced by partial-name match (`src/adapters/outbound/usage/*-pricing.ts`).
5. Check the interactive path stays port-clean: authoring/menu logic depends on the `Prompter` interface (`src/adapters/inbound/cli/prompter.ts`), `@clack/prompts` is isolated to `ClackPrompter`, and tests use `ScriptedPrompter`. New interactive code that imports clack outside `clack-prompter.ts` is a finding.
6. Run the gates yourself: `npm run typecheck`, `npm test`, `npm run build`. A green diff that only passes one of these is not reviewable as done.

## Examples

A port violation worth flagging — a use-case reaching into a provider adapter directly:

```typescript
// src/application/use-cases/run-spec-suite.ts
import { CodexUsageCapture } from "../../adapters/outbound/usage/codex-usage-capture.js"; // ✗ crosses the boundary
```

Fix: depend on `UsageCapturePort` (`src/application/ports/usage-capture-port.ts`) and inject the concrete collector from the composition root in `src/adapters/inbound/cli/main.ts`.

A metric-honesty finding:

```typescript
return { value: estimateCost(model), confidence: "high" }; // ✗ estimates are never "high"; and source/capture_source are missing
```

## Quality Bar

- Boundaries over style: a clean-looking change that crosses a port or imports a forbidden Node API is a blocker even if tests pass locally.
- Schemas are the contract. Any new field on an event, benchmark, metric, or report needs a Zod schema update and a reject-the-invalid-payload test.
- No real-harness calls anywhere in the test path; process-backed code must be driven by fakes.
- Redaction is on by default; reports/artifacts must not be able to leak known secrets. Hashes are preserved, values are not.
- README and `docs/specs`/`docs/adrs` are executable contracts here — `tests/acceptance/readme-gates.test.ts` checks the README; documentation drift is a finding.

## Resource Strategy

- This skill is the human/agent counterpart to the `/code-review` slash command; keep its checklist aligned with CONTRIBUTING's acceptance gates rather than duplicating them elsewhere.
- No scripts or assets; the authority is CONTRIBUTING.md plus the ADRs in `docs/adrs/`.
