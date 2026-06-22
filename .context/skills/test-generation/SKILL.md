---
type: skill
name: Test Generation
description: Generate comprehensive test cases for BMH. Use when writing tests for new functionality, adding regression tests for bug fixes, or improving coverage. Tests are written BEFORE implementation (TDD) and must never call real Codex or Claude Code.
skillSlug: test-generation
phases: [E, V]
generated: 2026-06-22
status: filled
scaffoldVersion: "2.0.0"
---
## Workflow

1. Write the failing test first. BMH is Spec Driven Development with TDD — production code must not be added before a test asserts the behavior (see `docs/specs/11-tdd-acceptance-test-plan.md`).
2. Put the test in `tests/acceptance/` next to its peers. Acceptance tests are the primary category here; `tests/unit/` and `tests/integration/` exist but the bulk of behavior is covered by acceptance tests that drive the real `runCli` or a real use-case wired to fakes.
3. Pick the right seam:
   - **CLI behavior** → call `runCli(["node", "bench-my-harness", ...args], { cwd, stdout, stderr, stdin, isTty })` from `src/adapters/inbound/cli/main.js` and assert on captured stdout and the exit code.
   - **Interactive flow** → drive the same `runCli` with `stdin` answers and `isTty: true`, OR construct a `ScriptedPrompter` (`src/adapters/inbound/cli/scripted-prompter.ts`) with an ordered `answers` list. Never instantiate `ClackPrompter` in a test — it touches a TTY.
   - **Use-case / domain** → construct the use-case (e.g. `RunSpecSuiteUseCase`, `BenchmarkRunner`) with in-memory or recording fakes for every port.
4. Use the shared fakes and fixtures, do not re-roll them: `tests/support/fakes/fake-harness-runner.ts`, `fake-hook-installer.ts`, `fake-artifact-collector.ts`, the git helper `tests/support/git-fixture.ts` (`createLocalGitFixture`), and the workspace helper `tests/support/spec19-fixtures.ts` (`createSpec19Workspace`, `createOutput`, `readJson`). Provider payloads live in `tests/fixtures/codex/` and `tests/fixtures/claude-code/`; benchmark inputs in `tests/fixtures/benchmarks/`.
5. For anything writing to disk, allocate a temp dir with `mkdtemp(join(tmpdir(), "bmh-..."))` and pass it as `cwd`. Never write into the repo tree.
6. Run `npm test` (Vitest, `vitest run`). For a single file: `npx vitest run tests/acceptance/<file>.test.ts`.

## Examples

A CLI acceptance test that exercises the interactive menu through `runCli` with scripted stdin (pattern from `tests/acceptance/cli-consolidation-interactive.test.ts`):

```typescript
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("no-args menu", () => {
  test("init then quit writes a catalog", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-menu-init-"));
    const chunks: string[] = [];

    const exit = await runCli(["node", "bench-my-harness"], {
      cwd,
      stdout: (c) => chunks.push(c),
      stderr: () => {},
      stdin: "init\nquit\n",
      isTty: true
    });

    const suite = JSON.parse(await readFile(join(cwd, ".bmh", "specs", "suite.json"), "utf8"));
    expect(exit).toBe(0);
    expect(suite.id).toBe("local-specs");
    expect(chunks.join("")).toContain("spec catalog initialized");
  });
});
```

A redaction contract test (every report must be secret-free by default; fixture is `tests/fixtures/security/secret-bearing-event.json`):

```typescript
const result = redactSecrets(secretBearingPayload);
expect(result.redacted).not.toContain("sk-");
expect(result.redactionApplied).toBe(true);
expect(result.findings[0].hash).toMatch(/^sha256:/); // hash preserved, secret gone
```

## Quality Bar

- TDD order is non-negotiable: the test must fail for the right reason before the implementation lands.
- The suite must never invoke a real `codex` or `claude` binary. Real-harness runs are opt-in local smoke tests, never part of `npm test` (CONTRIBUTING "Real harness smoke tests"). Drive process-backed paths with `FakeHarnessRunner` or a recording runner.
- Assert the acceptance gates that apply to the feature: schemas reject invalid payloads; every normalized event references a raw event (`raw_ref`); every metric observation carries `measurement_source`, `capture_source`, and `confidence`; hook installers write only inside the trial workspace; redaction strips known secrets before reports. See CONTRIBUTING "Acceptance gates".
- Tests are deterministic and isolated: temp dirs per test, no reliance on machine state, no network. Time/IDs that vary must be injected, not read from the clock.
- When testing comparability, cover all three verdicts (comparable / limited / not comparable) — a single happy path is insufficient.
- Respect architecture boundaries: a domain or application test must not import an adapter to set up state. `tests/acceptance/architecture-boundaries.test.ts` enforces this for `src/` and is itself a test you must keep green.

## Resource Strategy

- Add a fixture under `tests/fixtures/<provider>/` only when an existing payload cannot express the case; mirror the naming of the lifecycle event (`pre-tool-use.json`, `stop.json`, etc.).
- Add a shared helper to `tests/support/` only when three or more tests would otherwise duplicate non-trivial setup (the existing fakes and `git-fixture`/`spec19-fixtures` are the bar).
- Do not add `scripts/` or `references/` to this skill folder; the patterns live in the real test files cited above.
