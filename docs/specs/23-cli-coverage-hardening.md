# CLI Coverage Hardening

## Problem

The published CLI fails on valid invocations and emits misleading errors that the
test suite never exercises. A user running the latest published build hit this:

```text
$ npx bench-my-harness@latest add --from-git
benchmark init requires --base-ref
```

Two defects are visible in one line:

1. `add --from-git` with no `--base-ref` / `--golden-ref` produces an error, but the
   message names the wrong command (`benchmark init`), because the shared
   `requiredOption` helper (`src/adapters/inbound/cli/main.ts:1019`) hardcodes
   `benchmark init requires ${option}` while being reused by `add`.
2. There is no test for this path at all. The existing `add --from-git` acceptance
   tests (`tests/acceptance/cli-spec-authoring.test.ts`) always pass both
   `--base-ref` and `--golden-ref`, so the missing-argument branch is never run.

The deeper issue is structural, not a single typo. The acceptance suite covers the
**happy path** of each command well, but **validation, required-option, and
mutual-exclusion error paths are largely untested**. Shared error helpers therefore
drift (wrong command names, copy-pasted messages) and required-argument branches
ship unverified. The acceptance gate "README commands and documented flows match
executable behavior" is not enforced for failure modes.

## Decision

Add a dedicated CLI error-and-validation coverage layer so that every public command
verifies, at minimum:

- each documented happy path (already mostly covered — keep);
- every required-option / required-argument failure, asserting a **non-zero exit code
  and a message that names the correct command and the missing option**;
- every mutual-exclusion / conflicting-flag failure;
- every input-parse failure (malformed JSON flags, unsupported formats, empty globs).

Fix the `requiredOption` helper so error messages are command-accurate, then lock the
behavior with tests. No documented invocation may exit non-zero, and no error message
may reference a command other than the one invoked.

## Root Cause Fix

`requiredOption` must not assume the caller is `benchmark init`. Make the command
context explicit so the message is always correct.

Current:

```ts
function requiredOption(value: string | undefined, option: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`benchmark init requires ${option}`);
  }
  return value;
}
```

Target: pass the invoking command name (e.g. `add --from-git`) so the message reads
`add --from-git requires --base-ref`. Audit every other shared error helper and every
hardcoded `benchmark init …` string (`main.ts:905`, `986`, `990`, `1021`) for the same
class of reuse error and confirm each is only thrown by the command it names.

## CLI Surface and Coverage Gaps

The following table enumerates the public command surface and the error paths that are
currently unverified. Each unverified path becomes a required test below.

### `add` (spec authoring)

- `add --from-git` without `--base-ref` → missing-required error (the reported bug). **Gap.**
- `add --from-git` without `--golden-ref` → missing-required error. **Gap.**
- `add --from-git` error message names `add`, not `benchmark init`. **Gap.**
- `add <promptFile> --prompt-file <path>` → "accepts either … not both" (`main.ts:413`). **Gap.**
- `add` interactive mode with no resolvable repo source (`main.ts:429`). **Gap.**
- `add --from-git --range` with non-positive `--limit` → covered. Keep.
- `add --from-git` happy path → covered. Keep.

### `benchmark init`

- `--repo-url` + `--repo-path` + `--fixture-path` mutual exclusion (`main.ts:905`). **Gap.**
- `--detect-commands` without `--repo-path`, or with `--repo-url`/`--fixture-path` (`main.ts:986`). **Gap.**
- `--detect-commands` combined with manual setup/test commands (`main.ts:990`). **Gap.**
- template / interactive / detect happy paths → covered. Keep.

### `benchmark validate`

- accepts valid fixture / rejects invalid fixture → covered. Keep.
- YAML benchmark rejected with a clear message (`main.ts:1198`). **Gap.**

### `benchmark run`

- `--harness-command-json` not an object (`main.ts:1224`). **Gap.**
- `--harness-command-json` missing `executable` (`main.ts:1229`). **Gap.**
- `--harness-command-json` `args` not a string array (`main.ts:1238`). **Gap.**
- harness executable not found on PATH (`main.ts:1349`, `1364`). **Gap.**
- dry-run / fake-process / validation happy paths → covered. Keep.

### `import`

- glob pattern matches no files (`main.ts:1058`). **Gap.**
- multi-file import happy path → covered (cli-spec-import). Keep.

### `run` (spec suite)

- `--real` together with `--dry-run` (`main.ts:640`). **Gap.**
- `--real` when real execution is not configured for the build (`main.ts:645`). **Gap.**
- suite harness command JSON not an object / wrong harness count (`main.ts:1287`, `1293`). **Gap.**
- dry-run / smoke happy paths → covered. Keep.

### `report`

- neither `--input` nor `--run-id` provided (`main.ts:770`). **Gap.**
- report input not a JSON object (`main.ts:1491`). **Gap.**
- missing run id reported clearly → covered. Keep.

### `internal hook-capture`

- invalid `--provider` value → error. **Gap.**
- missing required option (`--event`, `--run-id`, `--trial-id`, `--spool`). **Gap.**
- valid stdin → spool write → covered. Keep.

## Acceptance Tests

Add tests under `tests/acceptance/`. Prefer extending the existing per-command files
(`cli-spec-authoring.test.ts`, `cli-public-surface.test.ts`,
`cli-init-benchmark*.test.ts`, `cli-spec-suite.test.ts`, `cli-report-store.test.ts`)
and add a focused `cli-error-paths.test.ts` for cross-command invariants. Use the
existing `runCli(argv, runtime)` harness that captures `stdout`/`stderr` and returns an
exit code.

Required tests:

1. **The reported bug.** `add --from-git` without `--base-ref` exits non-zero, writes
   nothing to the catalog, and prints `add --from-git requires --base-ref` (must not
   contain the string `benchmark init`).

   ```ts
   test("add --from-git without --base-ref fails with an add-specific message", async () => {
     const output = createOutput();
     const exitCode = await runCli(
       ["node", "bench-my-harness", "add", "--from-git"],
       { ...createRuntime(output), cwd: repo.path }
     );
     const result = cliResult(exitCode, output);
     expect(result.exitCode).not.toBe(0);
     expect(result.stderr).toContain("add --from-git requires --base-ref");
     expect(result.stderr).not.toContain("benchmark init");
   });
   ```

2. `add --from-git` with `--base-ref` but no `--golden-ref` → analogous message.
3. `add <file> --prompt-file <file>` → exits non-zero, message mentions only `add`.
4. One test per **Gap** row in the table above, each asserting non-zero exit, a message
   naming the invoked command and the offending option, and no partial side effects
   (no catalog/suite/workspace files written on failure).
5. **Cross-command invariant test:** for every documented example command in
   `README.md`, a smoke check that the invocation either succeeds or fails with a
   message that contains the invoked command name and never names a different command.

## Verification Commands

```bash
npm run typecheck
npm test
# Targeted:
npx vitest run tests/acceptance/cli-error-paths.test.ts tests/acceptance/cli-spec-authoring.test.ts
```

Manual reproduction that must now pass cleanly:

```bash
node ./dist/adapters/inbound/cli/main.js add --from-git   # prints: add --from-git requires --base-ref
```

## Documentation Updates

- Update `README.md` so the `add --from-git` examples make the required
  `--base-ref` / `--golden-ref` explicit, and note that `add --from-git` is
  non-interactive (it will not prompt for missing refs).
- Add an entry to `CHANGELOG.md` for the corrected error message and the new coverage.

## Risks and Constraints

- The fix must remain test-only plus a message/argument-plumbing change; it must not
  alter the success behavior of any command.
- Error-message strings become asserted contract. Keep them stable and command-scoped;
  avoid reintroducing shared helpers that hardcode a single command name.
- Tests must not invoke real Codex or Claude Code, consistent with the v1 test policy.
