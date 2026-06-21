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

Configure defaults:

```bash
bench-my-harness specs configure \
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
bench-my-harness specs create docs/specs/15-project-command-generation.md \
  --base-ref b8abf4b \
  --golden-ref f90fa73
```

Create multiple specs from Markdown prompt files:

```bash
bench-my-harness specs import docs/specs/*.md \
  --base-ref f90fa73 \
  --golden-ref HEAD
```

Run using suite defaults:

```bash
bench-my-harness specs run
```

Run a dry smoke test using suite defaults:

```bash
bench-my-harness specs smoke
```

Equivalent to:

```bash
bench-my-harness specs run --dry-run --trials 1
bench-my-harness report --run-id <generated-run-id> --format html
```

## Convention-Based Inference

When `specs create <prompt-file>` is used, BMH infers:

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

## Backward Spec UX

Backward Git authoring should also use defaults:

```bash
bench-my-harness specs create --from-git \
  --base-ref b8abf4b \
  --golden-ref f90fa73
```

When `--id` and `--name` are omitted:

- `id` is derived from commit subject or changed paths;
- `name` is derived from commit subject;
- `category`, commands, and suite inclusion come from defaults.

Generated backward specs still require review and must keep:

```json
{
  "metadata": {
    "source": "backward_git_draft",
    "review_status": "needs_human_review"
  }
}
```

## Import Behavior

`specs import` creates one spec per prompt file.

Rules:

- glob expansion may be performed by the shell or by BMH for quoted patterns;
- duplicate inferred ids must fail unless `--force` is provided;
- `--base-ref` and `--golden-ref` apply to all imported specs;
- per-file refs are not part of v1 import;
- imported specs must pass `specs validate`.

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
bench-my-harness specs configure
bench-my-harness specs create <prompt-file>
bench-my-harness specs import <prompt-file...>
bench-my-harness specs smoke
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
  - `specs configure` writes defaults into `.bmh/specs/suite.json`;
  - repeated `--setup-command` and `--test-command` preserve order;
  - explicit command flags override existing defaults;
  - invalid harness defaults are rejected.

- `tests/acceptance/cli-spec-convention-create.test.ts`
  - `specs create docs/specs/example.md --base-ref <base> --golden-ref <golden>` writes `spec.md` and `benchmark.json`;
  - generated benchmark stores resolved repo URL and command defaults;
  - generated spec is added to suite when `include_in_suite` default is true;
  - explicit `--id`, `--name`, `--category`, and command flags override inferred/default values.

- `tests/acceptance/cli-spec-import.test.ts`
  - imports multiple Markdown files;
  - rejects duplicate inferred ids without `--force`;
  - validates generated catalog after import.

- `tests/acceptance/cli-spec-smoke.test.ts`
  - `specs smoke` runs dry-run with one trial;
  - writes `results.json`;
  - writes `report.html`;
  - does not require real Codex or Claude Code.

## Documentation Updates

Update:

- `README.md` Getting Started to prefer the simplified commands;
- `docs/prompts/initialize-bmh-spec-catalog-prompt.md` to ask agents to run `specs configure` once and then use `specs create <prompt-file>`;
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
- Do not infer `base_ref` or `golden_ref` for forward specs unless the user provides them or uses Git backfill.
- Do not call real Codex or Claude Code from `specs smoke`.
- Do not weaken path traversal protections.
- Do not silently overwrite specs created from previous prompts.
- Do not treat inferred names or ids as semantic product requirements.
