# Interactive UX Overhaul

## Problem

The interactive authoring flow is a batch stdin reader, not an interactive UI.
`InteractiveBenchmarkAuthoring` (`src/adapters/inbound/cli/interactive-benchmark-authoring.ts`)
slurps all of stdin, splits it on `\n`, and replays one line per prompt
(`collect` / `ask`, lines 44–50, 151–166). Consequences:

- **No real selection.** `choose()` prints `Label (repo|fixture)` and reads a typed line
  (lines 138–149). There are no arrow keys, no highlighted default, no pick-list.
- **A flat wall of ~14 prompts.** Category, source, repo, commit, setup, test, prompt
  source, prompt, constraints, timeout, cost, required files, forbidden files, semantic
  requirements — all sequential `Label [default]:` lines with no grouping or structure.
- **No navigation, no review, no recovery.** You cannot go back, you cannot see a summary
  before it writes, and a typo in an early answer means restarting.
- **Validation happens after the fact.** Bad numbers/enums throw mid-run instead of being
  rejected inline at the prompt.
- **Ctrl-C is undefined behavior** rather than a clean cancel.

The flow is testable only because it is stdin-string-driven, which is exactly what makes
it unusable for humans.

## Decision

Replace the hand-rolled prompt loop with a real interactive UI built on
**`@clack/prompts`**, behind a **`Prompter` port** so the authoring logic never talks to a
TTY or to stdin directly. This preserves deterministic, fast tests (no real terminal)
while giving humans arrow-key selects, pre-highlighted defaults, inline validation,
grouped flow, a review step, and clean cancellation.

This spec implements the Interactive Mode section of spec 24. Spec 24's TTY rules
(flag-first; prompt only on a TTY; never prompt non-TTY) and defaults/autocomplete rules
still hold and are realized here.

## Dependency

Add `@clack/prompts` as a runtime dependency. It is small, ESM-native, and
TypeScript-first, consistent with the existing `commander` + `zod` footprint. It is the
only new runtime dependency this spec introduces.

## The Prompter Port

Define a `Prompter` interface in the inbound CLI adapter layer. The authoring use-case
depends on this interface, never on `@clack/prompts` or `process.stdin`.

```ts
export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label?: string;
  readonly hint?: string;
}

export interface Prompter {
  intro(title: string): void;
  outro(message: string): void;
  note(body: string, title?: string): void;
  text(opts: { message: string; placeholder?: string; defaultValue?: string;
    validate?: (value: string) => string | undefined }): Promise<string>;
  select<T extends string>(opts: { message: string; options: readonly SelectOption<T>[];
    initialValue?: T }): Promise<T>;
  multiselect<T extends string>(opts: { message: string; options: readonly SelectOption<T>[];
    initialValues?: readonly T[]; required?: boolean }): Promise<readonly T[]>;
  confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean>;
  spinner(): { start(msg: string): void; stop(msg: string): void };
}
```

Two implementations:

1. **`ClackPrompter`** (production) — thin wrapper over `@clack/prompts`. Maps each method
   to the matching clack primitive. It is constructed **only when stdin is a TTY**
   (per spec 24). On `isCancel` (Ctrl-C / Esc) from any clack call, it triggers a clean
   cancel: print a cancellation note via `clack.cancel`, write nothing, and exit non-zero.
2. **`ScriptedPrompter`** (tests) — constructed with an ordered list of answers (or a
   `message`→answer map). Returns deterministic values, applies the same `validate`
   callbacks the production path uses, and throws a clear error if it runs out of answers.
   This replaces today's stdin-string slurp in all interactive tests.

`runCli`'s injectable context (spec 24) selects the implementation: TTY → `ClackPrompter`,
test/non-TTY → `ScriptedPrompter` (or no prompter at all, forcing the required-option
failure path).

## Authoring Flow Rewrite

Rewrite `InteractiveBenchmarkAuthoring.collect()` to drive the `Prompter` port. Behavior:

- **Grouped, with structure.** `intro("bmh add")` at the start; `outro("Spec created: <path>")`
  at the end. Group related steps so the flow reads as stages, not a flat list.
- **Closed sets use `select`** with the resolved default as `initialValue`:
  - Category → `select` over `BenchmarkCategorySchema.options` (single source of truth).
  - Source → `select` over `repo | fixture`.
  - Prompt source → `select` over `text | file`.
  - Harnesses → `multiselect` over `codex | claude_code`. **Deferred from per-spec `add`:**
    harnesses are a catalog-level default owned by `init`, not a per-spec field on
    `BenchmarkAuthoringCommand` (which stays stable). The `multiselect` primitive is
    implemented and tested as a ready capability for catalog configuration; the per-spec
    authoring flow does not prompt for harnesses.
- **Free-text uses `text`** with `defaultValue`/`placeholder` from the resolved default, so
  Enter accepts the default (repo path, commands, etc.) — no retyping.
- **Yes/no uses `confirm`** (e.g. "Detect setup/test commands?", "Include in suite?").
- **Validation is inline.** Timeout/cost/number fields validate in the `validate` callback
  and re-prompt with the error shown, instead of throwing after collection. Enum fields
  cannot be mistyped because they are selects.
- **Command detection shows a spinner.** Wrap `generateCommands` and any filesystem work in
  `spinner().start()/stop()` so the UI does not appear frozen.
- **Review step before writing.** After collection, render a summary `note` of the spec and
  a final `confirm` ("Create this spec?"). No → cancel without writing. This is the
  go-back/recover affordance the current flow lacks.
- **Cancellation is clean everywhere.** Ctrl-C / Esc at any prompt aborts with a non-zero
  exit and writes no catalog, suite, or workspace files.

The collected `BenchmarkAuthoringCommand` shape is unchanged; only the collection
mechanism changes, so the downstream use-cases are untouched.

## Architecture

- `Prompter`, `ClackPrompter`, and `ScriptedPrompter` live in the inbound CLI adapter
  layer. The application/use-case layer stays non-interactive and pure (spec 24).
- No `@clack/prompts` import outside `ClackPrompter`. The authoring logic imports only the
  `Prompter` interface, so swapping or upgrading the engine touches one file.
- TTY detection comes from the injectable CLI context, not `process.stdin.isTTY` read in
  handlers.

## Acceptance Tests

All interactive tests run through `ScriptedPrompter`; none touch a real TTY.

1. **Scripted happy path.** Driving `add` through `ScriptedPrompter` with answers for each
   step produces the same spec the old stdin-string tests produced — port the existing
   `cli-spec-authoring` interactive fixtures onto `ScriptedPrompter`.
2. **Defaults accepted.** Empty/skip answers for repo and category yield catalog defaults
   (realizes spec 24 test 10).
3. **Category is a closed set from the schema.** The category `select` offers exactly
   `BenchmarkCategorySchema.options`; a newly added enum member appears with no CLI change
   (realizes spec 24 test 11). A select cannot receive an out-of-enum value.
4. **Inline validation.** A non-numeric timeout/cost is rejected by the `validate` callback
   and re-prompted; the invalid value never reaches the use-case.
5. **Review-step cancel writes nothing.** Answering No at the final confirm leaves the
   catalog, suite, and workspace untouched.
6. **Cancel writes nothing.** The end-to-end guarantee is proven via `runCli`: declining the
   final review confirm cancels at the point just before the write and leaves the catalog,
   suite, and workspace untouched. A separate unit test isolates the propagation mechanism —
   a `ScriptedPrompter` cancel signal mid-collection aborts with `PromptCancelledError` before
   a command is ever returned. (A true mid-flow Ctrl+C cannot be fed through a stdin string,
   so the two tests together cover the behavior.)
7. **Non-TTY never prompts.** With no prompter/TTY and a required value missing, the command
   fails fast with a required-option message and does not block (realizes spec 24 test 8).
8. **Engine isolation.** A guard test asserts `@clack/prompts` is imported only by
   `ClackPrompter` (e.g. a source scan), so the port boundary cannot silently erode.

## Documentation Updates

- README: note that `bmh` verbs are interactive on a TTY and fully flag-driven otherwise;
  optionally include a short recording/screenshot of the new flow.
- CHANGELOG: record the new interactive UX and the `@clack/prompts` dependency.

## Verification Commands

```bash
npm install
npm run typecheck
npm test
node ./dist/adapters/inbound/cli/main.js add   # real interactive flow on a TTY
```

## Risks and Constraints

- A new runtime dependency must stay quarantined behind `ClackPrompter`; test 8 enforces
  this.
- `@clack/prompts` renders to the real TTY, so it must never be constructed in tests or
  non-TTY contexts — the port selection in the CLI context is the guard.
- Keep the `BenchmarkAuthoringCommand` contract stable so the use-case layer and spec 24's
  consolidation are unaffected.
- Tests must not invoke real Codex or Claude Code, consistent with the v1 test policy.
