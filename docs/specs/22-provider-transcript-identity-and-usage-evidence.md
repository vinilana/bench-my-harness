# Provider Transcript Identity and Usage Evidence

## Status

Accepted for implementation.

## Context

BMH compares harnesses by functional correctness, time, token efficiency, and cost. Codex and Claude Code expose their richest usage evidence in local session transcript JSONL files, but those files are often outside the isolated benchmark workspace:

- Codex: user Codex session directory, commonly under `.codex/sessions`.
- Claude Code: user Claude project/session directory, commonly under `.claude/projects`.

Parsing these files is useful only if BMH can prove that the transcript belongs to the exact benchmark trial. A token or cost value from the wrong session would make the report actively misleading. Hooks alone are not sufficient usage evidence, but hook-referenced transcript paths are the strongest local bridge between the running harness and provider session artifacts.

## Decision

BMH will treat provider transcripts as explicit trial evidence with identity validation.

The benchmark runner must resolve a transcript source before usage capture. Resolution must:

1. prefer an explicit harness runner transcript path when present;
2. otherwise read the hook spool and use only transcript paths observed in hook payloads;
3. allow workspace-local transcript paths;
4. allow provider-local transcript paths only under approved provider roots for the selected harness;
5. validate transcript identity before trusting usage evidence;
6. pass the resolved transcript path to usage capture;
7. record unresolved or rejected transcript evidence as unavailable, not silently absent.

Artifact finalization must materialize the same resolved transcript as `transcript.jsonl` in the trial artifact directory. Reports and usage observations must reference the copied artifact, not a mutable provider-local path.

Provider-specific transcript path rules belong in outbound adapters. Domain and application models must stay provider-neutral.

## Scope

In scope:

- Codex and Claude Code only.
- Hook-spool transcript path extraction.
- Workspace-local transcript paths.
- Approved provider-local transcript roots.
- Lightweight identity checks suitable for local deterministic tests.
- Usage capture from the resolved transcript source.
- Artifact finalization copying the resolved transcript to `transcript.jsonl`.

Out of scope:

- Cursor, OpenCode, and Pi transcript resolution.
- Remote provider APIs or billing APIs.
- Perfect cryptographic proof of provider session identity when the provider does not expose a signed session claim.
- Redacting full transcript content beyond the existing artifact handling policy.

## Contract

### Transcript Resolution

`TrialTranscriptResolverPort` resolves transcript evidence from:

- `harness`;
- `workspace`;
- `hookSpoolPath`;
- optional `harnessTranscriptPath`;
- optional `processDiagnostics`.

The resolver returns:

- `transcriptPath` when accepted;
- `workspaceLocalTranscriptPath` when the accepted transcript also lives inside the trial workspace and can be consumed by legacy workspace-only artifact readers;
- `source` as `harness_result`, `hook_spool`, or `unavailable`;
- `confidence` as `high`, `medium`, or `none`;
- `unavailableReason` when no path is accepted.

### Approved Roots

Provider-local absolute paths are accepted only if they are hook-referenced and live under approved roots:

- Codex: `$CODEX_HOME/sessions` when `CODEX_HOME` is set, otherwise `$HOME/.codex/sessions`.
- Claude Code: `$CLAUDE_CONFIG_DIR/projects` when `CLAUDE_CONFIG_DIR` is set, otherwise `$HOME/.claude/projects`.

Multiple `CLAUDE_CONFIG_DIR` entries may be comma-separated. Each entry may point either to a Claude config directory or directly to `projects`.

Workspace-local paths remain valid for fake harnesses and deterministic fixtures.

### Identity Validation

A transcript is accepted when all available checks are consistent:

- The path was explicitly returned by the harness runner or observed in hook spool.
- Workspace-local paths resolve inside the trial workspace.
- Provider-local paths resolve inside the selected harness provider roots.
- If the transcript contains any workspace/cwd field, every observed value must match the trial workspace or be absent.
- If process diagnostics are available and the transcript contains timestamps, at least one timestamp must overlap the process execution interval or the transcript may be accepted with `medium` confidence when timestamp fields are absent.

If a check contradicts the trial, the transcript must be rejected with an explicit unavailable reason.

When multiple hook payloads expose transcript paths, the resolver must evaluate them in observed order and accept the first path that passes all path and identity checks. A rejected early hook path must not prevent a later valid hook path from being used.

### Usage Capture

Usage capture must read only the resolved transcript path supplied by the runner context or explicit adapter options. Usage adapters may parse provider-specific transcript formats, but they must not independently search global provider directories.

### Artifact Finalization

The finalizer must copy an accepted transcript to:

```text
.bmh/runs/<run-id>/specs/<spec-id>/<harness>/<trial-id>/transcript.jsonl
```

If a provider-local path is rejected, `artifact-index.json` must include `transcript.jsonl` as missing with a specific reason such as:

- `transcript path was not exposed`;
- `transcript path was outside approved provider roots`;
- `transcript workspace did not match trial workspace`;
- `transcript timestamps did not overlap process execution`;
- `transcript file was not readable`.

When strict telemetry is enabled, a missing or rejected hook spool or transcript artifact must fail artifact finalization. Best-effort mode must keep the trial result and record the missing artifact in `artifact-index.json`.

## Acceptance Tests

Add tests before implementation.

### Transcript Resolver

`tests/acceptance/provider-transcript-resolution.test.ts`

- accepts a workspace-local transcript path returned by the harness runner;
- accepts a hook-referenced Codex transcript under an approved Codex sessions root;
- accepts a hook-referenced Claude Code transcript under an approved Claude projects root;
- rejects an absolute transcript path outside approved provider roots;
- rejects a transcript whose `cwd` or `workspace` field contradicts the trial workspace;
- rejects a transcript whose timestamps do not overlap process diagnostics.

### Benchmark Runner Handoff

`tests/acceptance/benchmark-runner-transcript-usage.test.ts`

- runs a fake Codex trial where the hook spool references a provider-local transcript;
- resolves that transcript before usage capture;
- passes the resolved transcript path to usage capture;
- records the resolved transcript path in `artifact_paths.transcript_path`;
- leaves usage unavailable when the resolver rejects the transcript.

### Artifact Finalization

`tests/acceptance/spec-suite-artifact-finalization.test.ts`

- copies a hook-referenced provider-local transcript into `transcript.jsonl`;
- includes the copied transcript in `artifact_refs`;
- records a missing transcript artifact with the resolver rejection reason when identity validation fails.

## Implementation Notes

- Keep root policy and path validation in filesystem/outbound adapters.
- Keep `TrialTranscriptResolverPort` provider-neutral.
- Do not search global session directories without a hook or harness-runner reference.
- Do not mutate global Codex or Claude Code config.
- Do not treat estimated cost as native billing data.

## Verification Commands

```bash
npm test -- tests/acceptance/provider-transcript-resolution.test.ts
npm test -- tests/acceptance/benchmark-runner-transcript-usage.test.ts
npm test -- tests/acceptance/spec-suite-artifact-finalization.test.ts
npm test
npm run typecheck
npm run build
```

## Risks

- Provider transcript formats may change.
- Provider-local paths may include sensitive content; copied artifacts must follow the report redaction policy.
- Timestamp-free transcripts can only reach medium confidence.
- Pricing remains estimated unless a provider exposes native billing data for the trial.
