# Benchmark Prompt File Spec

## Problem

Some benchmark tasks are too large or too structured to fit comfortably in `prompt.text`. Users should be able to keep the task description in a Markdown spec file and reference that file from the benchmark JSON.

## Decision

Support two mutually exclusive prompt sources:

```json
{
  "prompt": {
    "text": "Add input validation to the login form."
  }
}
```

or:

```json
{
  "prompt": {
    "file": "benchmarks/login-validation.spec.md"
  }
}
```

`prompt.file` must point to a Markdown file ending in `.md`.

## Contract

### Prompt Object

The benchmark `prompt` object supports:

- `text`: inline prompt text.
- `file`: relative path to a Markdown prompt/spec file.
- `attachments`: optional list of extra attachment paths.
- `constraints`: optional list of constraints.

Rules:

- Exactly one of `prompt.text` or `prompt.file` must be present.
- `prompt.file` must end with `.md`.
- `prompt.file` must be a relative path inside the benchmark workspace or benchmark file directory.
- `prompt.file` content becomes the prompt delivered to the harness.
- `prompt.file` path is metadata; the Markdown file content is the executable prompt.
- Empty Markdown files are invalid.
- The Markdown file must be read during benchmark preparation or CLI validation, not inside the domain schema.

## Path and Security Rules

- Reject absolute paths.
- Reject path traversal such as `../outside.md`.
- Reject non-Markdown extensions.
- Reject missing files during CLI validation and benchmark execution.
- Preserve the prompt file path in run/report metadata.
- If report export includes prompt content, it must pass through the same redaction policy as other reportable text.

## Architecture

### Domain

`BenchmarkSchema` validates the structural rule:

- exactly one of `prompt.text` or `prompt.file`;
- `prompt.file` has `.md` suffix.

The domain must not read files.

### Application

Add a use case or helper:

```text
ResolveBenchmarkPromptUseCase
```

Responsibilities:

- receive benchmark object and benchmark file directory or workspace root;
- read Markdown prompt files through a port;
- return resolved prompt text plus source metadata.

### Ports

```text
PromptFileReaderPort
```

Responsibilities:

- read a relative `.md` prompt file;
- reject traversal and absolute paths;
- return content and content hash.

Filesystem implementation belongs in adapters.

### Adapters

CLI validation:

- `bench-my-harness validate benchmark path/to/benchmark.json` should fail if `prompt.file` is missing, outside the benchmark directory, not `.md`, or empty.

Benchmark runner:

- before calling `HarnessRunnerPort`, resolve `prompt.file` to text and pass the Markdown content as the prompt.

Benchmark authoring:

- `bench-my-harness init benchmark` interactive mode should ask whether the user wants inline prompt text or a Markdown prompt file.
- `bench-my-harness init benchmark --template` should support `--prompt-file path/to/spec.md` as an alternative to `--prompt`.

## Examples

### Inline Prompt

```json
{
  "prompt": {
    "text": "Add input validation to the login form.",
    "constraints": ["Do not change package.json"]
  }
}
```

### Prompt File

```json
{
  "prompt": {
    "file": "login-validation.spec.md",
    "constraints": ["Do not change package.json"]
  }
}
```

### Markdown Prompt File

```markdown
# Login Validation

Add input validation to the login form.

## Acceptance Criteria

- Invalid emails are rejected.
- Existing tests still pass.
- Do not change package.json.
```

## Acceptance Tests

Add tests before implementation:

- `tests/acceptance/benchmark-prompt-file-schema.test.ts`
  - accepts `prompt.file` ending in `.md`;
  - accepts `prompt.text`;
  - rejects benchmarks with neither `prompt.text` nor `prompt.file`;
  - rejects benchmarks with both `prompt.text` and `prompt.file`;
  - rejects `prompt.file` with non-`.md` extension.

- `tests/acceptance/prompt-file-reader.test.ts`
  - reads Markdown prompt files by relative path;
  - rejects absolute paths;
  - rejects `..` traversal;
  - rejects empty Markdown files;
  - returns `sha256:` content hash.

- `tests/acceptance/cli-prompt-file-validation.test.ts`
  - `validate benchmark` passes when `prompt.file` exists;
  - `validate benchmark` fails when the Markdown file is missing;
  - `run` passes Markdown file content to the harness runner.

- `tests/acceptance/cli-init-benchmark.test.ts`
  - `init benchmark --template --prompt-file task.md` writes `prompt.file`;
  - rejects `--prompt` and `--prompt-file` together.

## Implementation Plan

1. Add schema acceptance tests for `prompt.file`.
2. Update `BenchmarkSchema` prompt contract.
3. Add `PromptFileReaderPort` and filesystem adapter.
4. Add prompt resolving use case.
5. Wire CLI `validate benchmark` to resolve `prompt.file`.
6. Wire benchmark runner to pass resolved Markdown content to the harness.
7. Update benchmark authoring spec and CLI plan for `--prompt-file`.
8. Update README Getting Started with a prompt file example.
9. Run:

```bash
npm test
npm run typecheck
npm run build
```

## Risks and Constraints

- Do not allow arbitrary absolute path reads.
- Do not move file reading into domain schemas.
- Do not treat Markdown files as attachments; `prompt.file` is the primary prompt source.
- Do not allow both inline text and file-based prompt in the same benchmark.
