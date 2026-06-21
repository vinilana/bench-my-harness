import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { FilesystemProviderTranscriptResolver } from "../../src/adapters/outbound/filesystem/filesystem-provider-transcript-resolver.js";
import type { ProcessDiagnostics } from "../../src/application/ports/harness-runner-port.js";

describe("provider transcript resolution", () => {
  test("accepts a workspace-local transcript path returned by the harness runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-transcript-resolution-"));
    const workspace = join(root, "workspace");
    await mkdir(workspace, { recursive: true });
    const transcript = join(workspace, "transcript.jsonl");
    await writeFile(transcript, jsonl({ timestamp: "2026-06-21T10:00:01.000Z", payload: { cwd: workspace } }));

    const result = await resolver(root).resolve({
      harness: "codex",
      runId: "run_1",
      trialId: "trial_1",
      workspace,
      harnessTranscriptPath: transcript,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    expect(result).toEqual(expect.objectContaining({
      transcriptPath: transcript,
      source: "harness_result",
      confidence: "high"
    }));
  });

  test("accepts a hook-referenced Codex transcript under an approved sessions root", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-transcript-resolution-"));
    const workspace = join(root, "workspace");
    const codexHome = join(root, "codex-home");
    const transcript = join(codexHome, "sessions", "2026", "06", "21", "rollout.jsonl");
    const hooks = join(root, "hooks.jsonl");
    await mkdir(join(codexHome, "sessions", "2026", "06", "21"), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(transcript, jsonl(
      { timestamp: "2026-06-21T10:00:01.000Z", type: "turn_context", payload: { cwd: workspace, model: "gpt-5.3-codex" } },
      { timestamp: "2026-06-21T10:00:02.000Z", type: "event_msg", payload: { type: "token_count" } }
    ));
    await writeFile(hooks, jsonl({ hook_event_name: "Stop", transcript_path: transcript }));

    const result = await resolver(root, { CODEX_HOME: codexHome }).resolve({
      harness: "codex",
      runId: "run_1",
      trialId: "trial_1",
      workspace,
      hookSpoolPath: hooks,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    expect(result).toEqual(expect.objectContaining({
      transcriptPath: transcript,
      source: "hook_spool",
      confidence: "high"
    }));
  });

  test("accepts a hook-referenced Claude Code transcript under an approved projects root", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-transcript-resolution-"));
    const workspace = join(root, "workspace");
    const claudeConfig = join(root, "claude-config");
    const transcript = join(claudeConfig, "projects", "demo", "session.jsonl");
    const hooks = join(root, "hooks.jsonl");
    await mkdir(join(claudeConfig, "projects", "demo"), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(transcript, jsonl({ timestamp: "2026-06-21T10:00:01.000Z", cwd: workspace, message: { model: "claude-sonnet-4-20250514" } }));
    await writeFile(hooks, jsonl({ hook_event_name: "Stop", transcript_path: transcript }));

    const result = await resolver(root, { CLAUDE_CONFIG_DIR: claudeConfig }).resolve({
      harness: "claude_code",
      runId: "run_1",
      trialId: "trial_1",
      workspace,
      hookSpoolPath: hooks,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    expect(result).toEqual(expect.objectContaining({
      transcriptPath: transcript,
      source: "hook_spool",
      confidence: "high"
    }));
  });

  test("rejects an absolute transcript path outside approved provider roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-transcript-resolution-"));
    const workspace = join(root, "workspace");
    const transcript = join(root, "outside", "session.jsonl");
    const hooks = join(root, "hooks.jsonl");
    await mkdir(join(root, "outside"), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(transcript, jsonl({ timestamp: "2026-06-21T10:00:01.000Z", payload: { cwd: workspace } }));
    await writeFile(hooks, jsonl({ transcript_path: transcript }));

    const result = await resolver(root).resolve({
      harness: "codex",
      runId: "run_1",
      trialId: "trial_1",
      workspace,
      hookSpoolPath: hooks,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    expect(result).toEqual(expect.objectContaining({
      source: "unavailable",
      confidence: "none",
      unavailableReason: "transcript path was outside approved provider roots"
    }));
  });

  test("rejects transcripts whose workspace contradicts the trial workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-transcript-resolution-"));
    const workspace = join(root, "workspace");
    const otherWorkspace = join(root, "other-workspace");
    const transcript = join(workspace, "transcript.jsonl");
    await mkdir(workspace, { recursive: true });
    await writeFile(transcript, jsonl({ timestamp: "2026-06-21T10:00:01.000Z", payload: { cwd: otherWorkspace } }));

    const result = await resolver(root).resolve({
      harness: "codex",
      runId: "run_1",
      trialId: "trial_1",
      workspace,
      harnessTranscriptPath: transcript,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    expect(result).toEqual(expect.objectContaining({
      source: "unavailable",
      confidence: "none",
      unavailableReason: "transcript workspace did not match trial workspace"
    }));
  });

  test("rejects transcripts when any workspace field contradicts the trial workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-transcript-resolution-"));
    const workspace = join(root, "workspace");
    const transcript = join(workspace, "transcript.jsonl");
    await mkdir(workspace, { recursive: true });
    await writeFile(transcript, jsonl(
      { timestamp: "2026-06-21T10:00:01.000Z", payload: { cwd: workspace } },
      { timestamp: "2026-06-21T10:00:02.000Z", payload: { cwd: join(root, "other-workspace") } }
    ));

    const result = await resolver(root).resolve({
      harness: "codex",
      runId: "run_1",
      trialId: "trial_1",
      workspace,
      harnessTranscriptPath: transcript,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    expect(result).toEqual(expect.objectContaining({
      source: "unavailable",
      confidence: "none",
      unavailableReason: "transcript workspace did not match trial workspace"
    }));
  });

  test("continues past an invalid hook transcript path and accepts a later valid hook transcript", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-transcript-resolution-"));
    const workspace = join(root, "workspace");
    const codexHome = join(root, "codex-home");
    const invalidTranscript = join(root, "outside", "session.jsonl");
    const validTranscript = join(codexHome, "sessions", "2026", "06", "21", "rollout.jsonl");
    const hooks = join(root, "hooks.jsonl");
    await mkdir(join(root, "outside"), { recursive: true });
    await mkdir(join(codexHome, "sessions", "2026", "06", "21"), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(invalidTranscript, jsonl({ timestamp: "2026-06-21T10:00:01.000Z", payload: { cwd: workspace } }));
    await writeFile(validTranscript, jsonl({ timestamp: "2026-06-21T10:00:02.000Z", payload: { cwd: workspace } }));
    await writeFile(hooks, jsonl(
      { hook_event_name: "SessionStart", transcript_path: invalidTranscript },
      { hook_event_name: "Stop", transcript_path: validTranscript }
    ));

    const result = await resolver(root, { CODEX_HOME: codexHome }).resolve({
      harness: "codex",
      runId: "run_1",
      trialId: "trial_1",
      workspace,
      hookSpoolPath: hooks,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    expect(result).toEqual(expect.objectContaining({
      transcriptPath: validTranscript,
      source: "hook_spool",
      confidence: "high"
    }));
  });

  test("rejects transcripts whose timestamps do not overlap process execution", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-transcript-resolution-"));
    const workspace = join(root, "workspace");
    const transcript = join(workspace, "transcript.jsonl");
    await mkdir(workspace, { recursive: true });
    await writeFile(transcript, jsonl({ timestamp: "2026-06-21T11:00:01.000Z", payload: { cwd: workspace } }));

    const result = await resolver(root).resolve({
      harness: "codex",
      runId: "run_1",
      trialId: "trial_1",
      workspace,
      harnessTranscriptPath: transcript,
      processDiagnostics: diagnostics("2026-06-21T10:00:00.000Z", "2026-06-21T10:00:10.000Z")
    });

    expect(result).toEqual(expect.objectContaining({
      source: "unavailable",
      confidence: "none",
      unavailableReason: "transcript timestamps did not overlap process execution"
    }));
  });
});

function resolver(root: string, env: NodeJS.ProcessEnv = {}) {
  return new FilesystemProviderTranscriptResolver({ env: { HOME: root, ...env } });
}

function diagnostics(startedAt: string, endedAt: string): ProcessDiagnostics {
  return {
    stdout: "",
    stderr: "",
    exit: {
      executable: "harness",
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
