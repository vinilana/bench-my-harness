import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { FilesystemArtifactFinalizer } from "../../src/adapters/outbound/filesystem/filesystem-artifact-finalizer.js";
import { FilesystemProviderTranscriptResolver } from "../../src/adapters/outbound/filesystem/filesystem-provider-transcript-resolver.js";

describe("provider transcript artifact finalization", () => {
  test("copies a redacted hook-referenced provider transcript into the trial artifact directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-provider-finalization-"));
    const runsRoot = join(root, "runs");
    const workspace = join(root, "workspace");
    const codexHome = join(root, "codex-home");
    const transcript = join(codexHome, "sessions", "2026", "06", "21", "rollout.jsonl");
    const hooks = join(root, "hooks.jsonl");
    await mkdir(join(codexHome, "sessions", "2026", "06", "21"), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(transcript, jsonl({
      timestamp: "2026-06-21T10:00:01.000Z",
      payload: {
        cwd: workspace,
        command: "echo OPENAI_API_KEY=sk-test-1234567890"
      }
    }));
    await writeFile(hooks, jsonl({ hook_event_name: "Stop", transcript_path: transcript }));

    const result = await new FilesystemArtifactFinalizer({
      root: runsRoot,
      transcriptResolver: new FilesystemProviderTranscriptResolver({ env: { HOME: root, CODEX_HOME: codexHome } })
    }).finalize({
      runId: "run_provider_transcript",
      specId: "spec_1",
      harness: "codex",
      trialId: "trial_1",
      workspace,
      hookSpoolPath: hooks,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    const trialDir = join(runsRoot, "run_provider_transcript", "specs", "spec_1", "codex", "trial_1");
    const copiedTranscript = await readFile(join(trialDir, "transcript.jsonl"), "utf8");
    expect(copiedTranscript).toContain("\"cwd\"");
    expect(copiedTranscript).toContain("[REDACTED]");
    expect(copiedTranscript).not.toContain("sk-test-1234567890");
    expect(result.artifactRefs).toContain("specs/spec_1/codex/trial_1/transcript.jsonl");
    expect(result.artifactIndex).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ref: "transcript.jsonl",
        exists: true,
        kind: "transcript",
        capture_source: "hook_spool",
        confidence: "high",
        redaction: expect.objectContaining({
          status: "applied",
          raw_payloads_included: false
        })
      })
    ]));
  });

  test("records a missing transcript artifact when provider identity validation rejects it", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-provider-finalization-rejected-"));
    const runsRoot = join(root, "runs");
    const workspace = join(root, "workspace");
    const transcript = join(root, "outside", "session.jsonl");
    const hooks = join(root, "hooks.jsonl");
    await mkdir(join(root, "outside"), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(transcript, jsonl({ timestamp: "2026-06-21T10:00:01.000Z", payload: { cwd: workspace } }));
    await writeFile(hooks, jsonl({ hook_event_name: "Stop", transcript_path: transcript }));

    const result = await new FilesystemArtifactFinalizer({
      root: runsRoot,
      transcriptResolver: new FilesystemProviderTranscriptResolver({ env: { HOME: root } })
    }).finalize({
      runId: "run_provider_transcript_rejected",
      specId: "spec_1",
      harness: "codex",
      trialId: "trial_1",
      workspace,
      hookSpoolPath: hooks,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    expect(result.artifactRefs).not.toContain("specs/spec_1/codex/trial_1/transcript.jsonl");
    expect(result.artifactIndex).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ref: "transcript.jsonl",
        exists: false,
        kind: "transcript",
        unavailable_reason: "transcript path was outside approved provider roots"
      })
    ]));
  });

  test("fails strict telemetry when provider transcript identity validation rejects it", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-provider-finalization-strict-"));
    const runsRoot = join(root, "runs");
    const workspace = join(root, "workspace");
    const transcript = join(root, "outside", "session.jsonl");
    const hooks = join(root, "hooks.jsonl");
    await mkdir(join(root, "outside"), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(transcript, jsonl({ timestamp: "2026-06-21T10:00:01.000Z", payload: { cwd: workspace } }));
    await writeFile(hooks, jsonl({ hook_event_name: "Stop", transcript_path: transcript }));

    await expect(new FilesystemArtifactFinalizer({
      root: runsRoot,
      transcriptResolver: new FilesystemProviderTranscriptResolver({ env: { HOME: root } })
    }).finalize({
      runId: "run_provider_transcript_strict",
      specId: "spec_1",
      harness: "codex",
      trialId: "trial_1",
      workspace,
      hookSpoolPath: hooks,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z"),
      strictTelemetry: true
    })).rejects.toThrow(/transcript path was outside approved provider roots/);
  });
});

function diagnostics(startedAt: string, endedAt: string) {
  return {
    stdout: "",
    stderr: "",
    exit: {
      executable: "codex",
      args: [],
      exit_code: 0,
      timed_out: false,
      started_at: startedAt,
      ended_at: endedAt,
      duration_ms: Date.parse(endedAt) - Date.parse(startedAt)
    }
  };
}

function jsonl(...records: unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}
