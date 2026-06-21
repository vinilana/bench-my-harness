# CLI Defaults and Convention-Based Spec Authoring

## Problem

The current spec catalog CLI is explicit and reproducible, but common commands are too verbose.

Creating a spec often requires repeating values that are stable for the whole repository:

- catalog root;
- repository path;
- setup commands;
- validation commands;
- category;
- harnesses;
- trial count;
- workspace root;
- whether new specs should be added to the suite.

This makes the happy path harder than it should be and encourages copy-paste command drift.

BMH should keep benchmark contracts explicit while allowing users and coding agents to rely on catalog defaults and naming conventions during authoring.

## Decision

Add a catalog defaults layer and convention-based CLI shortcuts.

The benchmark files remain explicit. Defaults are only an authoring convenience. When a spec is created, BMH writes resolved values into that spec's `benchmark.json`.

## Suite Defaults

Extend `.bmh/specs/suite.json` defaults:

```json
{
  "defaults": {
    "repo_path": ".",
    "category": "feature",
    "trials": 3,
    "harnesses": ["codex", "claude_code"],
    "workspace_root": ".bmh/workspaces",
    "strict_telemetry": false,
    "setup_commands": ["npm install"],
    "test_commands": ["npm test", "npm run typecheck", "npm run build"],
    "include_in_suite": true
  }
}
```

Rules:

- `repo_path` is an authoring default and must be resolved to `repo.url` in generated benchmark files.
- `setup_commands` and `test_commands` are copied into each generated benchmark.
- `include_in_suite` controls authoring only; it is not a runtime behavior.
- CLI flags always override defaults.
- Existing generated benchmark files must not be rewritten unless `--force` is provided.

## CLI Surface

BMH exposes workflow commands at the top level. The old `specs ...`,
`benchmark init`, `benchmark validate`, and standalone benchmark `run`
surfaces are removed instead of retained as aliases.

Configure defaults:

```bash
bench-my-harness init \
  --repo-path . \
  --category feature \
  --setup-command "npm install" \
  --test-command "npm test" \
  --test-command "npm run typecheck" \
  --test-command "npm run build" \
  --harness codex \
  --harness claude_code \
  --trials 3 \
  --include-in-suite
```

Create a spec from a Markdown prompt file:

```bash
bench-my-harness add docs/specs/15-project-command-generation.md \
  --base-ref b8abf4b \
  --golden-ref f90fa73
```

Create multiple specs from Markdown prompt files:

```bash
bench-my-harness import docs/specs/*.md \
  --base-ref f90fa73 \
  --golden-ref HEAD
```

Run using suite defaults:

```bash
bench-my-harness run
```

Run a dry smoke test using suite defaults:

```bash
bench-my-harness smoke
```

Equivalent to:

```bash
bench-my-harness run --dry-run --trials 1
bench-my-harness report --run-id <generated-run-id> --format html
```

Check local readiness:

```bash
bench-my-harness doctor
```

Standalone benchmark JSON commands are advanced and grouped under:

```bash
bench-my-harness benchmark init
bench-my-harness benchmark validate <benchmark.json>
bench-my-harness benchmark run --benchmark <benchmark.json> --harness codex
```

Harness hooks call an internal command:

```bash
bench-my-harness internal hook-capture --provider codex --event PreToolUse
```

`internal hook-capture` is stable for generated hooks but hidden from normal help.

## Convention-Based Inference

When `add <prompt-file>` is used, BMH infers:

- `id` from the file basename;
- `name` from the first Markdown H1, or from the filename when no H1 exists;
- `category` from suite defaults;
- `repo_path` from suite defaults;
- `setup_commands` from suite defaults;
- `test_commands` from suite defaults;
- `include_in_suite` from suite defaults;
- tags from explicit `--tag` flags only in v1.

Filename normalization:

```text
15-project-command-generation.md -> project-command-generation
project-command-generation.md -> project-command-generation
Project Command Generation.md -> project-command-generation
```

Name inference:

```markdown
# Project Command Generation Spec
```

becomes:

```text
Project Command Generation Spec
```

## Generated Git Case UX

Generated Git authoring should also use defaults:

```bash
bench-my-harness add --from-git \
  --base-ref b8abf4b \
  --golden-ref f90fa73
```

When `--id` and `--name` are omitted:

- `id` and `name` come from deterministic generated defaults;
- `category`, commands, and suite inclusion come from defaults.

Generated Git cases must keep source and bias metadata:

```json
{
  "metadata": {
    "source": "generated_git",
    "generation_mode": "git_evidence",
    "prompt_mode": "behavior_summary",
    "bias_profile": "generated_from_history"
  }
}
```

## Import Behavior

`import` creates one spec per prompt file.

Rules:

- glob expansion may be performed by the shell or by BMH for quoted patterns;
- duplicate inferred ids must fail unless `--force` is provided;
- `--base-ref` and `--golden-ref` apply to all imported specs;
- per-file refs are not part of v1 import;
- imported specs must pass `doctor` catalog validation.

## Architecture

### Domain

Add pure helpers under `src/domain/benchmark`:

```text
SpecCatalogDefaults
inferSpecIdFromPromptPath
inferSpecNameFromMarkdown
mergeSpecAuthoringDefaults
```

Domain rules:

- no filesystem imports;
- no process imports;
- no CLI imports;
- no provider-specific schemas.

### Application

Add use cases:

```text
ConfigureSpecCatalogUseCase
CreateFeatureSpecFromPromptFileUseCase
ImportFeatureSpecsUseCase
RunSpecSuiteSmokeUseCase
```

Responsibilities:

- update `suite.json` defaults through a port;
- read prompt content through the catalog/prompt reader port;
- infer missing authoring fields;
- call existing feature spec creation use cases with resolved explicit values.

### Ports

Extend `SpecCatalogStore` with:

```text
updateDefaults(catalogRoot, defaults) -> SpecCatalog
```

No CLI, filesystem, or process details should leak into application use cases.

### Adapters

CLI changes:

```text
bench-my-harness init
bench-my-harness add <prompt-file>
bench-my-harness import <prompt-file...>
bench-my-harness smoke
bench-my-harness run
bench-my-harness doctor
bench-my-harness benchmark init
bench-my-harness benchmark validate <benchmark.json>
bench-my-harness benchmark run --benchmark <benchmark.json>
bench-my-harness internal hook-capture
```

Filesystem catalog store changes:

- update `suite.json` defaults atomically enough for local CLI use;
- preserve existing specs;
- reject invalid defaults before writing.

## Acceptance Tests

Add tests before implementation:

- `tests/acceptance/spec-catalog-defaults.test.ts`
  - validates extended suite defaults;
  - rejects unsupported default harnesses;
  - rejects non-positive default trials;
  - accepts setup and validation command defaults.

- `tests/acceptance/spec-authoring-inference.test.ts`
  - infers spec id from Markdown filename;
  - strips numeric prefixes from filenames;
  - infers name from first Markdown H1;
  - falls back to title-cased filename when H1 is missing;
  - merges suite defaults with explicit CLI overrides.

- `tests/acceptance/cli-spec-configure.test.ts`
  - `init` writes defaults into `.bmh/specs/suite.json`;
  - repeated `--setup-command` and `--test-command` preserve order;
  - explicit command flags override existing defaults;
  - invalid harness defaults are rejected.

- `tests/acceptance/cli-spec-convention-create.test.ts`
  - `add docs/specs/example.md --base-ref <base> --golden-ref <golden>` writes `spec.md` and `benchmark.json`;
  - generated benchmark stores resolved repo URL and command defaults;
  - generated spec is added to suite when `include_in_suite` default is true;
  - explicit `--id`, `--name`, `--category`, and command flags override inferred/default values.

- `tests/acceptance/cli-spec-import.test.ts`
  - imports multiple Markdown files;
  - rejects duplicate inferred ids without `--force`;
  - validates generated catalog after import.

- `tests/acceptance/cli-spec-smoke.test.ts`
  - `smoke` runs dry-run with one trial;
  - writes `results.json`;
  - writes `report.html`;
  - does not require real Codex or Claude Code.

- `tests/acceptance/cli-doctor.test.ts`
  - `doctor` validates the local spec catalog;
  - reports configured harness defaults;
  - reports missing real harness executables without starting a run.

- `tests/acceptance/cli-public-surface.test.ts`
  - top-level help shows workflow commands;
  - top-level help hides `internal hook-capture`;
  - removed legacy commands fail instead of aliasing.

## Documentation Updates

Update:

- `README.md` Getting Started to prefer the simplified commands;
- `docs/prompts/initialize-bmh-spec-catalog-prompt.md` to ask agents to run `init` once and then use `add <prompt-file>`;
- `docs/specs/16-spec-catalog-and-suite-reporting.md` to reference this spec for UX defaults.

## Verification Commands

```bash
npm test -- tests/acceptance/spec-catalog-defaults.test.ts
npm test -- tests/acceptance/spec-authoring-inference.test.ts
npm test -- tests/acceptance/cli-spec-configure.test.ts
npm test -- tests/acceptance/cli-spec-convention-create.test.ts
npm test -- tests/acceptance/cli-spec-import.test.ts
npm test -- tests/acceptance/cli-spec-smoke.test.ts
npm test
npm run typecheck
npm run build
```

## Risks and Constraints

- Do not hide benchmark contracts. Generated `benchmark.json` files must remain explicit.
- Do not infer `base_ref` or `golden_ref` for written specs unless the user provides them or uses generated Git cases.
- Do not call real Codex or Claude Code from `smoke`.
- Do not weaken path traversal protections.
- Do not silently overwrite addd from previous prompts.
- Do not treat inferred names or ids as semantic product requirements.
