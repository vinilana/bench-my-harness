# Project Command Generation Spec

## Problem

Users creating a benchmark for an existing repository often do not know which setup and validation commands should be written into `.benchmark.json`. Asking them to type commands manually during `init benchmark` creates friction and increases the chance of incomplete benchmark contracts.

## Decision

Add project command generation to benchmark authoring.

The CLI may inspect the selected local repository path, infer deterministic setup and validation commands, show or apply those commands during authoring, and write the resulting commands explicitly into the benchmark JSON.

Generated commands are an authoring convenience only. The benchmark runner continues to execute only `repo.setup_commands` and `repo.test_commands` from the benchmark contract.

## Scope

### v1 Supported Ecosystem

Initial implementation supports Node.js projects:

- `npm`
- `pnpm`
- `yarn`
- `bun`

Future ecosystems are roadmap items, not part of the v1 implementation:

- Python
- Rust
- Go
- .NET
- Java/Kotlin

## CLI Surface

### Template Mode

```bash
bench-my-harness init benchmark --template \
  --id local-001 \
  --name "Local benchmark" \
  --category feature \
  --repo-path . \
  --detect-commands \
  --prompt "Do the work." \
  --output local.benchmark.json
```

Rules:

- `--detect-commands` requires a local `--repo-path`.
- `--detect-commands` rejects `--repo-url` because arbitrary URLs are not inspectable during authoring.
- `--detect-commands` rejects `--fixture-path` in v1.
- `--detect-commands` rejects explicit `--setup-command` or `--test-command`; users must choose either generated commands or manual commands.
- If no supported project is detected, the command exits non-zero with a clear message.
- The generated benchmark stores concrete commands in `setup_commands` and `test_commands`; it does not store `detect_commands` metadata as executable behavior.

### Interactive Mode

When the selected source is a local repo path, the CLI asks:

```text
Detect setup and validation commands from this project? (Y/n):
```

If accepted, the CLI generates commands and continues authoring. If rejected, the existing manual `Setup commands` and `Test commands` prompts are used.

For scripted stdin tests, valid answers are:

- `y`, `yes`, or empty answer: generate commands.
- `n` or `no`: ask for manual commands.

## Node.js Detection Rules

The filesystem adapter reads only project metadata. It must not execute package manager commands.

### Project Signals

Required:

- `package.json`

Package manager:

- `pnpm-lock.yaml` -> `pnpm`
- `yarn.lock` -> `yarn`
- `bun.lock` or `bun.lockb` -> `bun`
- `package-lock.json` -> `npm`
- no lockfile -> `npm`

### Setup Commands

Generated setup command:

- `npm install`
- `pnpm install`
- `yarn install`
- `bun install`

### Validation Commands

Commands are generated only for scripts present in `package.json`.

Priority order:

1. `test`
2. `typecheck`
3. `lint`

Generated commands:

- npm: `npm test`, `npm run typecheck`, `npm run lint`
- pnpm: `pnpm test`, `pnpm run typecheck`, `pnpm run lint`
- yarn: `yarn test`, `yarn typecheck`, `yarn lint`
- bun: `bun test`, `bun run typecheck`, `bun run lint`

The `build` script is not included automatically in v1 because build commands may be expensive or produce artifacts. It can be added later as an optional interactive inclusion.

## Architecture

### Domain

No benchmark schema changes are required.

Optional pure types may live in:

```text
src/domain/benchmark/project-command-generation.ts
```

Responsibilities:

- define supported ecosystems, package managers, generated command result, and confidence/evidence fields;
- no filesystem, CLI, process, or package manager execution.

### Application

Add use case:

```text
src/application/use-cases/generate-project-commands.ts
```

Responsibilities:

- receive a project root and detector port;
- request project signals;
- generate setup and validation commands;
- fail when no supported project or no validation scripts are found.

### Ports

Add outbound port:

```text
ProjectCommandDetectorPort
```

Responsibilities:

- inspect project metadata by root path;
- return package manager, script names, and evidence;
- never execute commands.

### Adapters

Filesystem implementation:

```text
src/adapters/outbound/filesystem/filesystem-project-command-detector.ts
```

Responsibilities:

- read `package.json`;
- detect lockfiles;
- report supported script names;
- return explicit evidence.

CLI integration:

- `init benchmark --template --detect-commands` generates commands before calling `CreateBenchmarkTemplateUseCase`.
- interactive mode offers generation when source is a local repo path.

## Acceptance Tests

Add tests before implementation:

- `tests/acceptance/project-command-detector.test.ts`
  - detects npm from `package-lock.json`;
  - detects pnpm from `pnpm-lock.yaml`;
  - defaults Node package manager to npm when no lockfile exists;
  - returns supported scripts from `package.json`;
  - returns unsupported when `package.json` is missing.

- `tests/acceptance/generate-project-commands.test.ts`
  - generates setup and validation commands for npm;
  - generates package-manager-specific command syntax for pnpm, yarn, and bun;
  - orders validation commands as test, typecheck, lint;
  - fails when no validation scripts exist;
  - includes evidence and confidence in the generation result.

- `tests/acceptance/cli-init-benchmark-detect-commands.test.ts`
  - `--detect-commands` writes explicit setup and validation commands;
  - `--detect-commands` requires `--repo-path`;
  - rejects `--detect-commands` with manual setup or test commands;
  - generated file passes `validate benchmark`.

- `tests/acceptance/cli-init-benchmark-interactive.test.ts`
  - interactive authoring accepts detected commands for a local repo path;
  - interactive authoring can decline detection and enter manual commands.

## Implementation Plan

1. Add this spec and update README roadmap.
2. Add failing acceptance tests.
3. Add domain command generation types.
4. Add `ProjectCommandDetectorPort`.
5. Add `GenerateProjectCommandsUseCase`.
6. Add filesystem detector adapter.
7. Wire `--detect-commands` into template mode.
8. Wire interactive command detection into CLI authoring.
9. Run:

```bash
npm test
npm run typecheck
npm run build
```

## Risks and Constraints

- Do not execute package manager commands during authoring.
- Do not silently overwrite manual commands.
- Do not store generated command metadata as runtime behavior in the benchmark contract.
- Do not infer commands from unsupported ecosystems in v1.
- Do not add package manager dependencies; use Node.js filesystem and JSON parsing.
