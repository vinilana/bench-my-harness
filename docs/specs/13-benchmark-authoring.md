# Benchmark Authoring Spec

## Problem

Users need an easy and repeatable way to create a valid `.benchmark.json` file without copying an internal fixture by hand. The current CLI can validate and run JSON benchmarks, but it does not help users author one.

## Decision

Implement benchmark authoring in two compatible modes:

1. Interactive authoring: the default `bench-my-harness init benchmark` behavior. It asks guided questions and writes the JSON contract.
2. Template generation: an explicit non-interactive mode that writes a valid benchmark JSON file from flags and conservative defaults.

Both flows must produce output accepted by `BenchmarkSchema` and by `bench-my-harness validate benchmark`.

## CLI Surface

### Default Interactive Mode

```bash
bench-my-harness init benchmark --output login-validation.benchmark.json
```

`init benchmark` defaults to interactive mode unless a non-interactive flag is provided.

Questions:

- benchmark id;
- name;
- category;
- repo URL or fixture path;
- commit, when repo URL is used;
- setup commands;
- test commands;
- prompt text;
- prompt Markdown file, as an alternative to prompt text;
- constraints;
- timeout seconds;
- max cost USD;
- required files changed;
- forbidden files changed;
- semantic requirements.

Rules:

- Interactive mode uses stdin/stdout only in the CLI adapter.
- The application use case receives a complete command object; it must not read from the terminal.
- Empty optional answers are omitted from the JSON.
- The generated object is validated before writing.

### Explicit Template Mode

```bash
bench-my-harness init benchmark --template \
  --id login-validation-001 \
  --name "Login validation" \
  --category bugfix \
  --repo-url file:///workspace/app \
  --commit abc123 \
  --prompt "Add input validation to the login form." \
  --test-command "npm test" \
  --output login-validation.benchmark.json
```

Rules:

- Writes JSON only in v1.
- Template mode is selected by `--template` or by passing enough explicit non-interactive authoring flags.
- Fails if output exists unless `--force` is passed.
- Defaults:
  - `version`: `1.0.0`
  - `limits.timeout_seconds`: `900`
  - `expected_output.tests_must_pass`: `true`
  - `evaluation.scoring.tests`: `1`
- Supports `--fixture-path` as an alternative to `--repo-url`.
- Supports `--prompt-file path/to/spec.md` as an alternative to `--prompt`.
- Rejects commands that specify both `--repo-url` and `--fixture-path`.
- Rejects commands that specify both `--prompt` and `--prompt-file`.
- Rejects missing `--prompt`.
- Rejects `--prompt-file` values that do not end in `.md`.
- Output filename should conventionally end with `.benchmark.json`, but the command may write any `.json` path.

## Template JSON Shape

Minimum generated output:

```json
{
  "id": "login-validation-001",
  "name": "Login validation",
  "version": "1.0.0",
  "category": "bugfix",
  "repo": {
    "url": "file:///workspace/app",
    "commit": "abc123",
    "setup_commands": [],
    "test_commands": ["npm test"]
  },
  "prompt": {
    "text": "Add input validation to the login form.",
    "constraints": []
  },
  "expected_output": {
    "tests_must_pass": true,
    "required_files_changed": [],
    "forbidden_files_changed": [],
    "semantic_requirements": []
  },
  "limits": {
    "timeout_seconds": 900
  },
  "evaluation": {
    "scoring": {
      "tests": 1
    }
  }
}
```

The final implementation may omit empty arrays if `BenchmarkSchema` accepts the result.

## Architecture

### Domain

No new provider-specific domain types are required.

Optional pure helper:

```text
src/domain/benchmark/create-benchmark-template.ts
```

Responsibilities:

- construct a benchmark object from typed input;
- apply defaults;
- validate with `BenchmarkSchema`;
- return a plain object.

### Application

New use case:

```text
src/application/use-cases/create-benchmark-template.ts
```

Responsibilities:

- receive authoring input from adapters;
- call the pure benchmark template helper;
- return the validated benchmark object.

No filesystem or terminal access belongs in the use case.

### Ports

New optional outbound port:

```text
BenchmarkTemplateWriterPort
```

Responsibilities:

- write generated JSON;
- protect against accidental overwrite;
- support `force`.

The filesystem implementation belongs under adapters.

### Adapters

CLI adapter:

```text
bench-my-harness init benchmark
```

Filesystem writer adapter:

```text
src/adapters/outbound/filesystem/filesystem-benchmark-template-writer.ts
```

Interactive prompt adapter:

```text
src/adapters/inbound/cli/interactive-benchmark-authoring.ts
```

Interactive code must remain a CLI concern.

## Acceptance Tests

Add tests before implementation:

- `tests/acceptance/benchmark-template.test.ts`
  - creates a minimal valid benchmark object with defaults;
  - rejects input with neither repo nor fixture;
  - rejects input with both repo and fixture;
  - output passes `BenchmarkSchema`.

- `tests/acceptance/benchmark-template-writer.test.ts`
  - writes pretty JSON;
  - refuses overwrite by default;
  - overwrites with `force`;
  - rejects non-JSON output extension if we choose to enforce `.json`.

- `tests/acceptance/cli-init-benchmark.test.ts`
  - `init benchmark --template` writes a `.benchmark.json`;
  - generated file passes `validate benchmark`;
  - `--fixture-path` creates fixture benchmarks;
  - `--prompt-file` writes `prompt.file`;
  - `--force` overwrites;
  - missing prompt or prompt file exits non-zero with a clear error.

- `tests/acceptance/cli-init-benchmark-interactive.test.ts`
  - `init benchmark` without `--template` enters interactive mode by default;
  - scripted stdin answers produce a valid file;
  - empty optional answers are omitted or emitted as empty arrays consistently;
  - cancellation or EOF returns a clear non-zero exit.

## Implementation Plan

1. Add interactive-mode acceptance tests first, proving `init benchmark` defaults to interactive mode.
2. Add non-interactive template acceptance tests for `init benchmark --template`.
3. Add the pure benchmark template helper and application use case.
4. Add filesystem writer adapter.
5. Add `init benchmark` CLI command with interactive default and explicit `--template` mode.
6. Update README Getting Started to use `init benchmark` before `validate benchmark`.
7. Run:

```bash
npm test
npm run typecheck
npm run build
```

8. Keep JSON-only v1 behavior; YAML remains future.

## Risks and Constraints

- Do not introduce provider-specific fields into the benchmark schema.
- Do not add terminal prompting to domain or application layers.
- Do not overwrite existing benchmark files without `--force`.
- Do not execute setup/test commands during authoring.
- Do not support YAML in this feature unless the JSON-only v1 decision is changed by a separate ADR/spec update.
