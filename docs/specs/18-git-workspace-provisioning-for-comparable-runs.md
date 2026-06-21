# Git Workspace Provisioning for Comparable Runs

## Problem

The first real Codex run against this repository proved that BMH can execute Codex through the process harness path and capture real Codex hooks, but the run was not a comparable benchmark.

Run evidence:

```text
run_id: local_codex_real_single_002
trial_id: project-command-generation_codex_real_1
benchmark: project-command-generation@1.0.0
harness: codex
status: completed
captured hook events: 138
```

The trial workspace was created at:

```text
.bmh/workspaces/project-command-generation_codex_real_1
```

That workspace contained only BMH runtime files such as `.bmh/hooks.jsonl` and temporary Codex hook configuration. It was not a checkout of the benchmark repository at `repo.base_ref`.

Codex was able to inspect the parent repository because the workspace lived under the repository root, but it could not apply patches to the repository files because the real source tree was outside the writable Codex workspace. The final Codex message reported that the patch was rejected by sandbox policy because the repository was outside the writable project root.

This means the current real harness path validates execution and hook capture, but not benchmark comparability.

## Decision

Add git-aware workspace provisioning for repository benchmarks.

For every non-dry-run trial that uses `benchmark.repo`, BMH must create an isolated working copy of the benchmark repository at `repo.base_ref` before installing hooks or executing the harness.

The benchmark equation must become true in the filesystem:

```text
isolated checkout at repo.base_ref + prompt/spec.md -> harness changes -> validation against generated diff
```

The runner must never rely on a workspace nested inside the source repository as a substitute for a checkout.

## Scope

In scope:

- local `file://` repositories;
- local path repositories resolved from authoring defaults;
- git refs in `repo.base_ref`;
- optional collection of golden diff evidence from `repo.golden_ref`;
- Codex and Claude Code harnesses only;
- deterministic fake-git fixtures for tests.

Out of scope for this spec:

- remote HTTPS/SSH clone authentication;
- containerized execution;
- distributed runners;
- exact diff matching as the only success oracle;
- Cursor, OpenCode, and Pi adapters.

## Workspace Contract

For a benchmark with:

```json
{
  "repo": {
    "url": "file:///home/example/app",
    "base_ref": "abc123",
    "golden_ref": "def456"
  }
}
```

BMH must provision:

```text
<workspace-root>/<trial-id>/
  .git/
  <repository files checked out at abc123>
  .bmh/
    hooks.jsonl
  .codex/ or .claude/
    temporary hook configuration
```

Rules:

- The harness process `cwd` must be the checked-out repository root.
- Hook configuration must be written inside the trial checkout.
- The original source repository must remain unmodified.
- The trial checkout must start from `repo.base_ref`.
- Existing trial directories must not be reused unless an explicit cleanup or overwrite policy is implemented.
- If `repo.golden_ref` is present, BMH may collect a golden diff with:

```bash
git diff <base_ref>..<golden_ref>
```

- Golden diff collection failure must mark diff-similarity evidence as unavailable, not fail the trial by itself.

## Architecture

### Domain

Domain model stays provider-neutral and filesystem-free.

No Codex, Claude Code, `node:fs`, `node:child_process`, or git process details may enter domain helpers.

### Application

Extend workspace provisioning around an explicit source descriptor:

```text
WorkspaceProvisionerPort.provision(input)
  input.workspaceRoot
  input.trialId
  input.source?
    type: git
    repoUrl
    baseRef
```

The application runner must pass benchmark repo source information to the port when a repo benchmark is executed.

The existing prompt, hook, harness, validation, artifact, and scoring flow remains unchanged.

### Adapters

Add a git-backed filesystem provisioner implementation that can:

- clone or worktree a local `file://` repository;
- checkout `base_ref`;
- reject path traversal and invalid destination paths;
- return `workspace` and `spoolPath`;
- leave the source repository untouched.

Implementation may prefer standard `git` CLI calls in the adapter. No new dependency is required unless standard git operations prove insufficient.

## Acceptance Tests

Add tests before implementation.

### `tests/acceptance/git-workspace-provisioner.test.ts`

- provisions a workspace from a local git repository at `base_ref`;
- the workspace contains repository files from `base_ref`;
- files introduced only in `golden_ref` are absent at trial start;
- the source repository worktree is not modified;
- rejects destination paths that escape `workspace_root`;
- rejects unsupported non-local URLs with a clear error in v1.

### `tests/acceptance/benchmark-runner-git-workspace.test.ts`

- passes benchmark `repo.url` and `repo.base_ref` to the workspace provisioner;
- installs hooks inside the checked-out repository;
- runs the harness with `cwd` equal to the checked-out repository root;
- runs validation commands in the checked-out repository;
- collects the generated diff from the trial checkout;
- leaves the original repository unchanged.

### `tests/acceptance/spec-suite-real-workspace.test.ts`

- runs a suite with a fake process harness against a local git fixture;
- creates one checkout per spec, harness, and trial;
- verifies each checkout starts from the benchmark `base_ref`;
- persists per-trial artifacts under `.bmh/runs/<run-id>/specs/<spec-id>/<harness>/<trial-id>`;
- marks the run comparable when required validation and metric-source conditions are met.

## Data and Source Confidence

Workspace provenance must be recorded in trial output:

```json
{
  "workspace_source": {
    "type": "git",
    "repo_url": "file:///home/example/app",
    "base_ref": "abc123",
    "resolved_base_sha": "...",
    "golden_ref": "def456",
    "resolved_golden_sha": "..."
  }
}
```

Rules:

- Missing `resolved_base_sha` makes the trial `inconclusive` or `environment_failed`.
- Missing `resolved_golden_sha` only disables golden diff evidence.
- Token, context, and cost metrics remain governed by existing metric source confidence rules.

## Security

- Do not mutate global git config.
- Do not mutate global Codex or Claude Code config.
- Do not execute remote clone authentication flows in v1.
- Normalize all workspace paths before git commands.
- Reject workspace destinations outside `workspace_root`.
- Do not include secrets from remote URLs in reports; redact credentials if present.

## Implementation Sequence

1. Add failing acceptance tests for git workspace provisioning.
2. Extend `WorkspaceProvisionerPort` input to accept optional git source.
3. Implement local-file git provisioning in the filesystem adapter.
4. Pass benchmark repo source data from `BenchmarkRunner`.
5. Ensure validation commands execute inside the checkout.
6. Collect trial diff from the checkout.
7. Record workspace provenance in results.
8. Update README real harness examples to explain that real runs require a git checkoutable benchmark repo.

## Verification Commands

```bash
npm test -- tests/acceptance/git-workspace-provisioner.test.ts
npm test -- tests/acceptance/benchmark-runner-git-workspace.test.ts
npm test -- tests/acceptance/spec-suite-real-workspace.test.ts
npm test
npm run typecheck
npm run build
```

## Done Criteria

- A real Codex trial starts inside a checkout at `repo.base_ref`.
- Codex can modify files inside that checkout without needing access to the parent source repository.
- The original repository remains clean after the trial.
- The run output records enough workspace provenance to audit comparability.
- Dry-run tests remain deterministic and do not require Codex or Claude Code binaries.
