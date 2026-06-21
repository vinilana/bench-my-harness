# CLI Consolidation and Interactive Mode

## Problem

The CLI exposes two parallel command layers that collide on names and overlap on
behavior, plus a hidden internal layer:

| Layer | Unit of work | Commands |
| --- | --- | --- |
| Catalog / suite (top-level) | `.bmh/specs/` — a collection of specs run as a suite across N harnesses x M trials | `init`, `add`, `import`, `doctor`, `run`, `report` |
| `benchmark` namespace | a single standalone benchmark JSON file, one trial | `benchmark init`, `benchmark validate`, `benchmark run` |
| `internal` (hidden) | one hook event | `hook-capture` |

The split causes real UX problems:

- `init` is overloaded: `init` (create a catalog) vs `benchmark init` (create a benchmark file).
- `run` is overloaded: `run` (run a suite) vs `benchmark run` (run one trial).
- Dry suite execution is not its own concept — it is `run` wired to dry-run adapters with one trial (`main.ts:695`).
- `add [promptFile]` and `import <promptFiles...>` differ only in arity.
- Validation is split: `benchmark validate` exists, but catalog validation lives in `doctor`.

A new user cannot tell from `bmh --help` whether they want `init` or `benchmark init`,
or why both `run` and `benchmark run` appear to "run" things.

There are no external users yet, so this is a clean cut: remove the redundant surface
outright with no aliases and no deprecation window.

## Decision

Collapse the visible surface from ten commands to five verbs keyed on a single unit
(the spec/benchmark), and make interactive mode the default entry for humans while
keeping every flag working non-interactively for agents and CI.

The single standalone benchmark file does not disappear as a concept — it stops being a
parallel command namespace and becomes a flag on the consolidated verbs. This also fits
the hexagonal layering better than a second command tree.

### Target command surface

```text
bmh init                 set up the catalog + authoring defaults (interactive by default)
bmh add [files...]       create one or more specs; absorbs `import` and `--from-git`
bmh run                  run the suite by default
                           --dry-run         dry suite execution
                           --benchmark FILE  run a single standalone benchmark (absorbs `benchmark run`)
bmh check [path]         validate catalog and/or a benchmark file (absorbs `doctor` + `benchmark validate`)
bmh report               render a run report (unchanged)
bmh internal hook-capture   hidden, unchanged
```

Removed outright: the `benchmark` parent command and its `init` / `validate` / `run`
subcommands; the top-level `import`; the top-level `doctor`
(renamed to `check`).

## Command Mapping

| Old | New | Notes |
| --- | --- | --- |
| `init` | `bmh init` | unchanged behavior; interactive by default |
| `benchmark init` | `bmh add` / `bmh init` | a standalone benchmark file is now produced by `add`; remove the separate verb |
| `add [promptFile]` | `bmh add [files...]` | accepts one or many files |
| `import <files...>` | `bmh add [files...]` | merged into `add`; glob patterns still supported |
| `add --from-git` | `bmh add --from-git` | unchanged flags (see spec 23 for the required-option fix) |
| `doctor` | `bmh check` | catalog readiness |
| `benchmark validate <path>` | `bmh check <path>` | validate a single benchmark file when a path is given |
| `run` (suite) | `bmh run` | default mode |
| `benchmark run` | `bmh run --benchmark FILE` | single-file mode of the same verb |
| `report` | `bmh report` | unchanged |

`bmh check` with no path validates the catalog (old `doctor`). With a path it validates
that benchmark file (old `benchmark validate`). With both a catalog and a path it does
both.

`bmh run` mode selection:

- no `--benchmark` flag: run the catalog suite (old `run`).
- `--benchmark FILE`: run that single benchmark (old `benchmark run`).
- `--dry-run`: use dry-run adapters for suite execution.

## Interactive Mode

Interactive mode is additive, never lossy. Rules:

1. **`bmh` with no arguments launches a guided menu**: Set up a catalog, Add a spec,
   Run, Check, View report — each branching into the prompts the relevant verb already
   uses (`add` and `init` already collect interactive answers via stdin today).
2. **Flag-first, prompt-as-fallback**: when a required value is missing *and* stdin is a
   TTY, prompt for it. When all flags are present, run non-interactively with no prompts.
3. **Non-TTY never prompts**: when stdin is not a TTY (CI, agents, pipes) and a required
   value is missing, fail immediately with a clear required-option message. This closes
   the failure mode from spec 23 where a non-interactive context could otherwise hang or
   emit a misleading error.
4. Every prompt has a corresponding flag; anything answerable interactively is also
   settable non-interactively.

### Defaults and autocomplete

Interactive mode must not make users type values that are already known. Today the
authoring flow uses blocking `required(...)` prompts (`interactive-benchmark-authoring.ts`)
that force free-text entry for `Category` and `Repo URL or path` even though both have
known values. This changes:

1. **Every prompt is pre-filled with its resolved default** and accepts an empty answer
   (Enter) to take that default. Defaults resolve in order: explicit flag, then loaded
   catalog defaults (`loadSpecDefaults` / `SpecCatalogDefaults`), then the built-in
   fallback. Concretely:
   - **Repo**: default to `defaults.repo_path ?? "."`. The user presses Enter to accept;
     they do not retype the repo path.
   - **Category**: default to `defaults.category ?? "feature"`.
   - **Setup / test commands, harnesses, trials, include-in-suite**: pre-filled from the
     same defaults layer.
2. **Closed-set fields use selection / autocomplete, not free text.** `Category` is the
   fixed enum `feature | bugfix | refactor | performance | security | test | docs |
   maintenance | other` (`BenchmarkCategorySchema`); `Source` is `repo | fixture`;
   `Prompt source` is `text | file`; harness is `codex | claude_code`. These render as a
   pick-list (arrow keys) or prefix-autocomplete over the known values, with the resolved
   default highlighted. The single source of truth for category choices is the Zod enum —
   the prompt must derive its options from the schema, never a hardcoded copy, so adding a
   category never desyncs the CLI.
3. **Invalid free-typed values are re-prompted, not accepted.** An out-of-enum category
   must not reach the use-case; the prompt rejects and re-asks (interactive) or fails with
   a clear message (non-TTY), consistent with rule 3 above.

## Architecture

- Command wiring lives in `src/adapters/inbound/cli/main.ts`; consolidation is an
  inbound-adapter change. Use-cases (`CreateFeatureSpec*`, `RunSpecSuite*`,
  `ValidateSpecCatalog`, the single-benchmark runner) are reused unchanged — the verbs
  are re-routed to the same application layer, not rewritten.
- The interactive menu reuses the existing interactive collectors
  (`interactive-benchmark-authoring.ts`) rather than introducing a new prompt stack.
- TTY detection belongs in the CLI context (alongside `stdin`/`stdout`/`stderr`) so it
  is injectable and testable, not read from `process.stdin.isTTY` directly in handlers.

## Acceptance Tests

Build on the harness in spec 23 (`runCli(argv, runtime)` with captured streams and an
injectable TTY flag). Required tests:

1. `bmh --help` lists exactly the five public verbs and hides `internal`; it does not
   list `benchmark`, `import`, or `doctor`.
2. The removed commands (`benchmark`, `benchmark init/validate/run`, `import`,
   `doctor`) exit non-zero as unknown commands.
3. `bmh add` accepts multiple files and a glob, producing the same specs the old
   `import` produced (port the old `import` assertions onto `add`).
4. `bmh run --benchmark FILE` reproduces the old `benchmark run` behavior, including
   dry-run.
5. `bmh run --dry-run` produces a one-trial dry suite run.
6. `bmh check` validates the catalog; `bmh check <path>` validates a benchmark file;
   each rejects invalid input with a clear message.
7. **Interactive**: with TTY on and a required value omitted, the prompt fires and the
   command succeeds from supplied answers.
8. **Non-TTY**: with TTY off and a required value omitted, the command fails fast with a
   required-option message naming the invoked verb and never blocks on stdin.
9. `bmh` with no args and TTY on opens the menu; with TTY off it prints help and exits
   non-zero.
10. **Defaults accepted with Enter**: with catalog defaults set (e.g. `repo_path` and
    `category`), an interactive `add` that answers every prompt with an empty line
    produces a spec whose repo and category equal the catalog defaults — the user never
    types them.
11. **Category is a closed set**: the category prompt offers exactly the
    `BenchmarkCategorySchema` values, highlights the default, and rejects/re-prompts an
    out-of-enum value rather than passing it to the use-case. A test that adds a new enum
    member must see it offered without any CLI-side change (guards against a hardcoded
    copy).

## Documentation Updates

- Rewrite the `README.md` command sections and the "Current CLI surface" block around
  the five verbs; remove all `benchmark *`, `import`, and `doctor` examples.
- Update `CHANGELOG.md` with the breaking surface change (pre-1.0, no migration path).
- Revisit spec 23's coverage matrix: error-path tests for removed commands move onto the
  consolidated verbs; the `add --from-git` required-option fix carries over unchanged.

## Verification Commands

```bash
npm run typecheck
npm test
node ./dist/adapters/inbound/cli/main.js --help        # five verbs only
node ./dist/adapters/inbound/cli/main.js                # interactive menu (TTY)
```

## Risks and Constraints

- `bmh run` now carries two modes (suite vs single file). Mitigate with a `run --help`
  that shows both modes explicitly; keep the default (no flag) as the suite path.
- Interactive code must stay out of the application layer; use-cases remain
  non-interactive and pure. The CLI adapter owns all prompting and TTY decisions.
- Tests must not invoke real Codex or Claude Code, consistent with the v1 test policy.
- Sequence after spec 23 is merged, or land them together, since consolidation moves the
  surface that spec 23's error-path tests target.
