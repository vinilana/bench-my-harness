# Spec Catalog and Suite Reporting

## Problem

Users need a repeatable way to benchmark harnesses against features that already exist in their codebase.

A single benchmark prompt is useful for early validation, but it does not scale to a real evaluation program where a team wants to ask:

- Which harness best re-implements known past features?
- Which harness is fastest and cheapest for this repository?
- Which harness is most reliable across a suite, not only one task?
- Which individual specs failed, passed, or produced inconclusive evidence?

BMH must support a local repository of benchmark specs stored under `.bmh`, load those specs as suite input, execute each spec against selected harnesses, persist outputs per spec, and render an HTML report with both per-spec benches and a global bench.

## Decision

Add a local spec catalog stored under:

```text
.bmh/specs
```

The catalog contains feature specs for work that has already been implemented in the past. Each feature spec includes a Markdown task spec and a benchmark contract that fixes repository state, validation commands, expected output, limits, and evaluation weights.

BMH will add a suite runner that:

1. loads `.bmh/specs/suite.json`;
2. resolves each referenced feature benchmark;
3. runs every selected spec for every selected harness;
4. stores artifacts and results under `.bmh/runs/<run-id>`;
5. produces machine-readable results;
6. produces `report.html` with per-spec results, per-harness filters, and a global aggregate.

This feature does not change the v1 harness scope. Production support remains limited to Codex and Claude Code.

## Catalog Layout

Recommended layout:

```text
.bmh/
  specs/
    suite.json
    features/
      login-validation/
        spec.md
        benchmark.json
      pricing-rounding/
        spec.md
        benchmark.json
  runs/
    <run-id>/
      results.json
      report.html
      specs/
        login-validation/
          codex/
            trial_1/
              result.json
              diff.patch
              test-output.txt
              transcript.jsonl
          claude_code/
            trial_1/
              result.json
              diff.patch
              test-output.txt
              transcript.jsonl
```

The catalog is designed to be committed with the repository. Run outputs under `.bmh/runs` may be committed only when a team explicitly wants historical benchmark evidence in source control.

## Suite Contract

`.bmh/specs/suite.json`:

```json
{
  "id": "core-regression-suite",
  "name": "Core regression suite",
  "version": "1.0.0",
  "description": "Features previously implemented in this repository.",
  "specs": [
    {
      "id": "login-validation",
      "path": "features/login-validation/benchmark.json",
      "tags": ["auth", "bugfix"]
    },
    {
      "id": "pricing-rounding",
      "path": "features/pricing-rounding/benchmark.json",
      "tags": ["billing", "feature"]
    }
  ],
  "defaults": {
    "trials": 3,
    "harnesses": ["codex", "claude_code"],
    "workspace_root": ".bmh/workspaces",
    "strict_telemetry": false
  }
}
```

Rules:

- `id`, `name`, `version`, and `specs` are required.
- Each `specs[].path` must be relative to `.bmh/specs`.
- Paths must not escape `.bmh/specs`.
- `defaults.harnesses` may include only supported production harnesses in v1: `codex` and `claude_code`.
- CLI flags may override defaults for harness, trial count, run id, workspace root, and strict telemetry.
- Suite metadata must not contain secrets.

## Feature Benchmark Contract

Each feature benchmark remains a normal benchmark contract and must pass `BenchmarkSchema`.

Example:

```json
{
  "id": "login-validation",
  "name": "Login validation",
  "version": "1.0.0",
  "category": "bugfix",
  "difficulty": "medium",
  "tags": ["auth", "validation"],
  "repo": {
    "url": "file:///workspace/product",
    "base_ref": "9f3b18a",
    "golden_ref": "2cbe932",
    "setup_commands": ["npm install"],
    "test_commands": ["npm test", "npm run typecheck"]
  },
  "prompt": {
    "file": "spec.md",
    "constraints": [
      "Do not change the database schema.",
      "Keep existing public API behavior."
    ]
  },
  "expected_output": {
    "tests_must_pass": true,
    "required_files_changed": ["src/auth/validation.ts"],
    "forbidden_files_changed": ["package.json"],
    "semantic_requirements": [
      "Invalid emails without a domain are rejected.",
      "Existing error message keys are preserved."
    ]
  },
  "limits": {
    "timeout_seconds": 900,
    "max_cost_usd": 5,
    "max_input_tokens": 200000,
    "max_output_tokens": 50000
  },
  "evaluation": {
    "scoring": {
      "tests": 0.5,
      "semantic_requirements": 0.25,
      "diff_quality": 0.1,
      "cost_efficiency": 0.1,
      "constraints": 0.05
    }
  },
  "metadata": {
    "created_by": "benchmark-team",
    "source": "previously implemented feature"
  }
}
```

Additional repository fields:

- `repo.base_ref`: the initial repository ref used as the starting point for the benchmark.
- `repo.golden_ref`: the known good final ref where the feature already exists.

Rules:

- `repo.base_ref` is required for spec-catalog benchmarks that target a git repository.
- `repo.golden_ref` is recommended when the benchmark represents a previously implemented feature.
- If `repo.golden_ref` is present, BMH may collect the golden diff as evaluation evidence.
- A missing `repo.golden_ref` does not invalidate the benchmark, but diff similarity scoring must be marked unavailable.
- `prompt.file` must point to a relative Markdown file next to the benchmark or below the feature directory.
- `prompt.file` must not escape the feature directory.

## Golden-State Semantics

A spec in this catalog describes known work:

```text
base_ref + spec.md -> expected behavior represented by golden_ref and validation commands
```

BMH should not require the harness output to match the golden diff exactly. A different implementation may be valid if deterministic validations and expected-output rules pass.

Golden state is evidence, not the only oracle.

Evaluation priority:

1. setup and validation commands;
2. required and forbidden file changes;
3. semantic requirements with explicit rubric;
4. golden diff similarity when `repo.golden_ref` is available;
5. LLM or human review, only when marked subjective.

## Suite Execution

The suite runner must execute the Cartesian product of:

```text
selected specs x selected harnesses x trial count
```

For every trial:

1. provision an isolated workspace from the spec source and `base_ref`;
2. install temporary harness instrumentation;
3. pass the resolved Markdown spec as the harness prompt;
4. execute the harness;
5. run setup and validation commands;
6. collect diff, transcript, test output, normalized events, and metrics;
7. uninstall temporary hooks;
8. store the trial result below `.bmh/runs/<run-id>/specs/<spec-id>/<harness>/<trial-id>`.

The runner must continue the suite after an individual trial failure unless the user passes a future fail-fast option.

## CLI Surface

For convention-based defaults, prompt-file inference, bulk prompt import, and `specs smoke`, see
[`17-cli-defaults-and-convention-authoring.md`](./17-cli-defaults-and-convention-authoring.md).

For git checkout provisioning required by comparable real runs, see
[`18-git-workspace-provisioning-for-comparable-runs.md`](./18-git-workspace-provisioning-for-comparable-runs.md).

For real Codex/Claude Code suite execution, command profiles, hook command resolution, and process diagnostics, see
[`19-real-harness-suite-execution-and-diagnostics.md`](./19-real-harness-suite-execution-and-diagnostics.md).

Create or update the local spec catalog:

```bash
bench-my-harness specs init
```

Create a spec interactively:

```bash
bench-my-harness specs create
```

Create a spec non-interactively:

```bash
bench-my-harness specs create \
  --id login-validation \
  --name "Login validation" \
  --category bugfix \
  --repo-path . \
  --base-ref 9f3b18a \
  --golden-ref 2cbe932 \
  --prompt-file ./docs/features/login-validation.md \
  --test-command "npm test" \
  --test-command "npm run typecheck"
```

Create a backward spec draft from an already implemented feature:

```bash
bench-my-harness specs create --from-git \
  --id login-validation \
  --name "Login validation" \
  --category bugfix \
  --repo-path . \
  --base-ref 9f3b18a \
  --golden-ref 2cbe932
```

Create drafts for multiple historical changes:

```bash
bench-my-harness specs backfill \
  --repo-path . \
  --range main~20..main \
  --limit 25 \
  --output .bmh/specs/backfill
```

Validate a catalog:

```bash
bench-my-harness specs validate
```

Run all specs with suite defaults:

```bash
bench-my-harness specs run
```

Run selected harnesses:

```bash
bench-my-harness specs run \
  --harness codex \
  --harness claude_code
```

Run selected specs:

```bash
bench-my-harness specs run \
  --spec login-validation \
  --spec pricing-rounding
```

Run selected tags:

```bash
bench-my-harness specs run --tag auth
```

Render or re-render an HTML report:

```bash
bench-my-harness report \
  --run-id <run-id> \
  --format html
```

Rules:

- The default catalog root is `.bmh/specs`.
- `--catalog-root <path>` may override the catalog root.
- CLI defaults and convention-based shortcuts are specified separately in `docs/specs/17-cli-defaults-and-convention-authoring.md`.
- `specs create` defaults to interactive mode when required authoring fields are missing and stdin/stdout are TTYs.
- `specs create --from-git` creates a draft spec from Git evidence and marks semantic requirements as requiring review.
- `specs backfill` creates draft specs only; drafts are not included in `suite.json` unless `--include-in-suite` is passed.
- `specs backfill` defaults to `--limit 25` when no limit is provided.
- `specs backfill --limit <count>` must reject non-positive values.
- Generated specs must be deterministic and safe to edit by humans.
- `--harness` may be repeated.
- `--spec` may be repeated.
- `--tag` may be repeated.
- `--dry-run` must use fake harness execution and deterministic fixtures.
- Real Codex and Claude Code execution remains explicit opt-in in local smoke flows.

## Spec Authoring

BMH must make it easy to create specs before or after a feature exists.

Two authoring paths are required:

1. forward authoring: a user writes a spec before asking a harness to implement it;
2. backward authoring: a user or agent creates a spec after the feature already exists, using Git history and repository evidence.

Backward authoring is important because many teams will adopt BMH after their product already has useful historical features. Those features should be converted into benchmark specs without requiring teams to manually reconstruct every prompt.

### Interactive Creation

`bench-my-harness specs create` should ask for:

- spec id;
- name;
- category;
- difficulty;
- tags;
- repo path;
- base ref;
- golden ref;
- setup commands;
- validation commands;
- constraints;
- required changed files;
- forbidden changed files;
- semantic requirements;
- timeout and optional cost/token limits;
- whether to add the spec to `suite.json`.

When `--repo-path` points to a supported local project, command generation from `docs/specs/15-project-command-generation.md` may be offered as an authoring convenience.

The generated files are:

```text
.bmh/specs/features/<spec-id>/spec.md
.bmh/specs/features/<spec-id>/benchmark.json
```

If `.bmh/specs/suite.json` does not exist, `specs create` may offer to create it.

### Backward Spec Drafting From Git

`bench-my-harness specs create --from-git` should inspect local Git metadata and create a draft benchmark spec for an already implemented feature.

Inputs:

- `--repo-path`;
- `--base-ref`;
- `--golden-ref`;
- `--id`;
- `--name`;
- `--category`;
- optional `--prompt-file`;
- optional setup and validation commands;
- optional `--include-in-suite`.

Evidence BMH may derive from Git:

- changed files between `base_ref` and `golden_ref`;
- diff summary;
- commit messages in the selected range;
- test files changed;
- package or config files changed;
- probable tags from changed paths.

Generated `spec.md` must be a draft and must clearly identify fields requiring human review. It should not claim certainty about product intent that is not present in the evidence.

Example generated draft:

```markdown
# Login validation

## Goal

Re-implement the behavior introduced between `9f3b18a` and `2cbe932`.

## Evidence From Existing Implementation

- Changed files:
  - `src/auth/validation.ts`
  - `tests/auth/validation.test.ts`

## Expected Behavior

TODO: Review and replace this section with product-level requirements.

## Constraints

- Preserve public API compatibility unless the historical diff proves otherwise.
- Prefer the smallest change that satisfies validation commands.
```

The corresponding `benchmark.json` should include:

- `repo.base_ref`;
- `repo.golden_ref`;
- generated `required_files_changed` candidates;
- generated `forbidden_files_changed` only when explicitly provided by the user;
- generated setup and validation commands when accepted by the user;
- `metadata.source = "backward_git_draft"`;
- `metadata.review_status = "needs_human_review"`.

### Agent-Assisted Backward Specs

BMH may later allow a coding agent to improve a backward draft, but the initial implementation must keep this separate from deterministic spec creation.

Agent-assisted authoring rules:

- agents may propose clearer `spec.md` wording from diff and commit evidence;
- agents may propose semantic requirements;
- agents may not silently include the spec in the suite without user confirmation;
- agent-generated content must be marked in metadata;
- deterministic validation commands remain the primary oracle;
- subjective claims require review status.

This keeps the CLI useful for teams that want agents to backfill many specs while preserving trust in the benchmark catalog.

## Report Requirements

The suite report must be written to:

```text
.bmh/runs/<run-id>/report.html
```

The report must include:

- run id, suite id, suite version, generated timestamp;
- selected harnesses, spec count, trial count;
- global benchmark summary;
- per-harness summary;
- per-spec summary;
- per-spec and per-harness trial details;
- observability coverage;
- comparability status and reasons;
- unavailable token, cost, or context metrics shown explicitly;
- links or references to local artifacts;
- redaction status.

The HTML report must support client-side filtering by:

- harness;
- spec id;
- tag;
- status;
- comparability status.

The first version may use static HTML, CSS, and inline JavaScript with no new frontend framework.

Raw payloads must not be embedded in `report.html` by default.

## Global Benchmark Summary

The global bench is an aggregate across all selected specs and harnesses.

It must show at least:

- total specs attempted;
- total trials attempted;
- completed trials;
- failed trials;
- inconclusive trials;
- pass rate by harness;
- mean, median, min, max, and standard deviation of score by harness;
- mean duration by harness;
- total and mean cost by harness when available;
- total and mean tokens by harness when available;
- count of unavailable metrics by harness;
- comparability status.

If data is not comparable, the report must show why instead of ranking harnesses as if they were comparable.

## Per-Spec Output

Each spec result must include:

- spec id and version;
- harness;
- trial id;
- status;
- failure classification when failed;
- validation command results;
- score;
- duration;
- metrics with source and confidence;
- artifact references;
- comparability status;
- notes.

## Architecture

### Domain

Add pure domain models under `src/domain/benchmark` and `src/domain/reports` as needed:

```text
SpecCatalog
FeatureSpecReference
SpecSuiteRun
SpecTrialResult
HarnessAggregate
GlobalBenchmarkSummary
SuiteReport
```

Domain rules:

- no filesystem imports;
- no process execution;
- no CLI imports;
- no Codex or Claude Code raw schemas;
- no HTML rendering concerns in domain models.

### Application

Add use cases:

```text
CreateSpecCatalogUseCase
CreateFeatureSpecUseCase
CreateBackwardSpecDraftUseCase
LoadSpecCatalogUseCase
ValidateSpecCatalogUseCase
RunSpecSuiteUseCase
BuildSuiteReportUseCase
ExportHtmlReportUseCase
```

Responsibilities:

- create or update a local spec catalog;
- create feature spec files from explicit user input;
- create backward spec drafts from Git evidence;
- load catalog through ports;
- validate suite and benchmark contracts;
- resolve Markdown spec prompts;
- orchestrate existing `BenchmarkRunner` per spec;
- aggregate results;
- request report persistence.

### Ports

Add or extend ports:

```text
GitHistoryInspectorPort
SpecCatalogStore
SuiteResultStore
ReportStore
WorkspaceProvisionerPort
```

Responsibilities:

- `GitHistoryInspectorPort`: inspect local Git refs, changed files, commit messages, and diff summaries without leaking process execution into application logic.
- `SpecCatalogStore`: load suite JSON, benchmark JSON, and Markdown spec files without exposing filesystem APIs to application logic.
- `SuiteResultStore`: persist machine-readable suite results and per-trial outputs.
- `ReportStore`: persist `report.html` and existing JSON/Markdown report forms.
- `WorkspaceProvisionerPort`: prepare a workspace at `repo.base_ref` when the spec uses git refs.

### Adapters

Filesystem adapters:

```text
src/adapters/outbound/git/process-git-history-inspector.ts
src/adapters/outbound/filesystem/filesystem-spec-catalog-store.ts
src/adapters/outbound/storage/filesystem-suite-result-store.ts
src/adapters/outbound/storage/filesystem-html-report-store.ts
```

CLI integration:

```text
bench-my-harness specs init
bench-my-harness specs create
bench-my-harness specs backfill
bench-my-harness specs validate
bench-my-harness specs run
bench-my-harness report --format html
```

## Data and Source Confidence

Suite reporting must preserve the existing observability model:

- every metric must include `measurement_source`;
- every metric must include `capture_source`;
- every metric must include `confidence`;
- native and estimated token values must not be silently mixed;
- missing token, cost, and context data must be represented as unavailable;
- report rankings must be limited or blocked when critical data is missing or incompatible.

Golden diff similarity, if implemented, is `derived` evidence and must not be confused with deterministic validation success.

## Security and Privacy

Rules:

- report output must be redacted by default;
- raw payloads must not be embedded in HTML;
- catalog paths must be normalized and must not escape the catalog root;
- prompt files must not escape their feature directory;
- run artifact links must stay under `.bmh/runs/<run-id>`;
- suite metadata must not include secrets;
- temporary hook installation must remain project-local to the isolated workspace.

## Acceptance Tests

Add tests before implementation:

- `tests/acceptance/spec-catalog-schema.test.ts`
  - validates a minimal `.bmh/specs/suite.json`;
  - rejects missing suite id, name, version, or specs;
  - rejects unsupported harnesses in v1 defaults;
  - rejects paths that escape `.bmh/specs`;
  - validates feature benchmarks with `prompt.file`.

- `tests/acceptance/spec-catalog-loader.test.ts`
  - loads all feature specs from a fixture catalog;
  - resolves benchmark paths relative to `.bmh/specs`;
  - resolves Markdown prompt files relative to the feature directory;
  - supports filtering by spec id;
  - supports filtering by tag;
  - fails clearly when a referenced benchmark is missing.

- `tests/acceptance/spec-suite-runner.test.ts`
  - runs selected specs across selected harnesses using fake harnesses;
  - creates one isolated workspace per spec, harness, and trial;
  - passes the resolved Markdown spec exactly as the prompt;
  - continues after an individual trial fails;
  - stores per-spec, per-harness, per-trial results.

- `tests/acceptance/spec-suite-report-html.test.ts`
  - builds `report.html` from deterministic suite results;
  - includes global summary;
  - includes per-harness summary;
  - includes per-spec summary;
  - includes filter controls for harness, spec id, tag, status, and comparability;
  - excludes raw payloads and known secrets.

- `tests/acceptance/cli-spec-suite.test.ts`
  - `specs validate` validates the default `.bmh/specs` catalog;
  - `specs validate --catalog-root <path>` validates a custom catalog;
  - `specs run --dry-run` creates `.bmh/runs/<run-id>/results.json`;
  - `specs run --dry-run` creates `.bmh/runs/<run-id>/report.html`;
  - `report --run-id <run-id> --format html` re-renders the HTML report.

- `tests/acceptance/cli-spec-authoring.test.ts`
  - `specs init` creates `.bmh/specs/suite.json`;
  - `specs create` writes `spec.md` and `benchmark.json`;
  - `specs create` can add the new spec to `suite.json`;
  - `specs create --from-git` writes a backward draft with `base_ref`, `golden_ref`, changed-file evidence, and `review_status = "needs_human_review"`;
  - `specs backfill` creates draft specs without adding them to the suite by default;
  - `specs backfill` creates at most 25 draft specs by default;
  - `specs backfill --limit <count>` overrides the default draft count limit;
  - `specs backfill --limit 0` is rejected;
  - authoring rejects paths that escape `.bmh/specs`;
  - generated specs pass `specs validate`.

## Fixtures

Add deterministic fixtures:

```text
tests/fixtures/spec-catalogs/minimal/.bmh/specs/suite.json
tests/fixtures/spec-catalogs/minimal/.bmh/specs/features/login-validation/spec.md
tests/fixtures/spec-catalogs/minimal/.bmh/specs/features/login-validation/benchmark.json
tests/fixtures/spec-catalogs/invalid-path-escape/.bmh/specs/suite.json
tests/fixtures/spec-suite-results/basic/results.json
tests/fixtures/git-history/login-validation-diff.patch
tests/fixtures/git-history/login-validation-log.txt
```

Fixtures must not require real Codex or Claude Code binaries.

## Implementation Plan

1. Add this spec.
2. Add failing acceptance tests and fixtures.
3. Add catalog, spec authoring, and suite report schemas in the domain.
4. Add `SpecCatalogStore`, `SuiteResultStore`, and `GitHistoryInspectorPort` ports.
5. Add filesystem catalog loader/writer with path traversal protection.
6. Add Git history inspector adapter.
7. Add spec authoring use cases for init, explicit create, and backward draft creation.
8. Add suite runner use case that reuses `BenchmarkRunner`.
9. Add suite result aggregation and global benchmark summary.
10. Add static HTML report serialization.
11. Add CLI commands for `specs init`, `specs create`, `specs backfill`, `specs validate`, `specs run`, and `report --format html`.
12. Update README Getting Started after executable behavior exists.
13. Run:

```bash
npm test -- tests/acceptance/cli-spec-authoring.test.ts
npm test -- tests/acceptance/spec-catalog-schema.test.ts
npm test -- tests/acceptance/spec-catalog-loader.test.ts
npm test -- tests/acceptance/spec-suite-runner.test.ts
npm test -- tests/acceptance/spec-suite-report-html.test.ts
npm test -- tests/acceptance/cli-spec-suite.test.ts
npm test
npm run typecheck
npm run build
```

## Risks and Constraints

- Do not rank harnesses globally when comparability is limited or blocked.
- Do not require exact golden diff matches for success.
- Do not run real Codex or Claude Code in acceptance tests.
- Do not mutate global user harness configuration.
- Do not add a frontend framework for the first HTML report unless static HTML becomes insufficient.
- Do not expand v1 production harness scope beyond Codex and Claude Code.
- Do not treat unavailable token, context, or cost data as zero.
- Do not treat Git history inference as a reviewed product spec.
- Do not include backward drafts in a benchmark suite without explicit user confirmation.
- Do not let agent-assisted authoring weaken deterministic validation requirements.
