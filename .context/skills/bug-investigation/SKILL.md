---
type: skill
name: Bug Investigation
description: Investigate bugs systematically in BMH and find root cause. Use when diagnosing unexpected CLI output, failing trials, missing/low-confidence usage metrics, redaction leaks, or schema rejections. Reproduce through the real seams before patching.
skillSlug: bug-investigation
phases: [E, V]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---
## Workflow

1. Reproduce deterministically first. Most behavior is observable through `runCli(...)` from `src/adapters/inbound/cli/main.js` with captured `stdout`/`stderr` and a temp `cwd`, or by constructing the use-case (`RunSpecSuiteUseCase`, `BenchmarkRunner`, etc.) with the recording fakes in `tests/support/`. Never reach for a real `codex`/`claude` run to reproduce — the bug almost always reproduces against a fake.
2. Locate the layer. BMH is hexagonal: decide whether the defect is in the `domain/` (schema, scoring, comparability, redaction), `application/use-cases` (orchestration), or an `adapters/` boundary (CLI parsing, hook install, usage capture, filesystem store). Run the focused suite for that area, e.g. `npx vitest run tests/acceptance/<area>.test.ts`.
3. Follow the data, not the symptom. For an event problem, trace raw → normalized: every normalized event must carry a `raw_ref` (`src/domain/events/normalized-event.ts`, `normalize-raw-hook-event.ts`). For a metric problem, check `measurement_source`/`capture_source`/`confidence` on the `MetricObservation` and whether the value was correctly marked unavailable instead of guessed.
4. Watch the usage-capture trust path closely — it is a common source of "missing metrics" bugs. A transcript is only trusted when it is returned by the runner or referenced by a hook event, lives under an approved provider root, and passes trial-identity checks (`src/adapters/outbound/usage/`, `filesystem-provider-transcript-resolver.ts`). "Metric unavailable" is frequently correct behavior, not a bug.
5. Write a failing regression test that captures the bug at the right seam (see the `test-generation` skill), confirm it fails, then fix the smallest unit that makes it pass.
6. Gate the fix: `npm run typecheck`, then `npm test`, then `npm run build`.

## Examples

Reproduce a CLI defect end-to-end and inspect the artifact it writes:

```typescript
const cwd = await mkdtemp(join(tmpdir(), "bmh-bug-"));
const out: string[] = [];
await runCli(["node", "bench-my-harness", "run", "--dry-run", "--run-id", "repro"], {
  cwd, stdout: (c) => out.push(c), stderr: () => {}
});
const results = JSON.parse(await readFile(join(cwd, ".bmh", "runs", "repro", "results.json"), "utf8"));
// assert on the persisted artifact, not just stdout
```

Diagnose a "cost is missing" report: confirm whether the model is in the embedded pricing table (`src/adapters/outbound/usage/openai-pricing.ts` / `claude-pricing.ts`). Unknown model variants are intentionally left unavailable rather than priced by partial name match — verify before treating it as a bug.

## Quality Bar

- A fix is not done until a regression test reproduces the bug and now passes; never patch blind.
- Distinguish "intentionally unavailable" from "broken". Missing native cost, partial observability in best-effort mode, and "not comparable" verdicts are designed behaviors with explicit reasons — confirm against the relevant ADR (`docs/adrs/005`, `011`, `013`) before changing them.
- Keep the fix inside the layer that owns the defect; do not let a domain bug get patched in an adapter or vice versa. `tests/acceptance/architecture-boundaries.test.ts` must stay green.
- Re-verify the acceptance gates the area touches (raw_ref present, source+confidence on every metric, hooks confined to the workspace, redaction before reports) — a bug fix that quietly breaks one is a regression.
- Confirm the fix on both modes when telemetry is involved: best-effort marks the trial partial; strict fails it as `adapter_failed`.

## Resource Strategy

- No standing scripts needed; reproduction is a throwaway test or a `runCli` call in a temp dir.
- If a class of bug recurs, add a fixture under `tests/fixtures/` capturing the offending payload rather than documenting it prose-only.
- Record any genuinely surprising root cause as an ADR update in `docs/adrs/` only when it reflects a design decision, not a one-off typo.
