import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { FilesystemWorkspaceProvisioner } from "../../src/adapters/outbound/filesystem/filesystem-workspace-provisioner.js";
import { CodexUsageCapture } from "../../src/adapters/outbound/usage/codex-usage-capture.js";
import type { HookInstallation, InstallHarnessHooksInput, InstallHarnessHooksPort } from "../../src/application/ports/install-harness-hooks-port.js";
import type { HarnessRunnerInput, HarnessRunnerPort, HarnessRunnerResult } from "../../src/application/ports/harness-runner-port.js";
import type { NormalizedUsageCapturePort, UsageCaptureContext, UsageReport } from "../../src/application/ports/usage-capture-port.js";
import type {
  TrialTranscriptResolutionInput,
  TrialTranscriptResolutionResult,
  TrialTranscriptResolverPort
} from "../../src/application/ports/trial-transcript-resolver-port.js";
import { BenchmarkRunner } from "../../src/application/use-cases/run-benchmark.js";
import { FakeArtifactCollector } from "../support/fakes/fake-artifact-collector.js";
import benchmark from "../fixtures/benchmarks/login-validation.benchmark.json" with { type: "json" };

describe("benchmark runner transcript usage handoff", () => {
  test("resolves hook-referenced transcripts before usage capture and records the resolved path", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-transcript-"));
    const transcriptPath = join(root, "provider", "session.jsonl");
    const transcriptResolver = new RecordingTranscriptResolver({
      transcriptPath,
      source: "hook_spool",
      confidence: "high"
    });
    const usageCapture = new RecordingUsageCapture();
    const artifactCollector = new FakeArtifactCollector();

    const runner = new BenchmarkRunner({
      hookInstaller: new RecordingHookInstaller(),
      harnessRunner: new RecordingHarnessRunner({
        exitCode: 0,
        processDiagnostics: processDiagnostics()
      }),
      artifactCollector,
      workspaceProvisioner: new FilesystemWorkspaceProvisioner(),
      transcriptResolver,
      usageCapture
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "codex",
      runId: "run_transcript_handoff",
      trialId: "trial_transcript_handoff",
      workspaceRoot: root
    });

    expect(result.artifact_paths?.transcript_path).toBe(transcriptPath);
    expect(transcriptResolver.calls).toHaveLength(1);
    expect(transcriptResolver.calls[0]).toEqual(expect.objectContaining({
      harness: "codex",
      runId: "run_transcript_handoff",
      trialId: "trial_transcript_handoff",
      hookSpoolPath: expect.stringContaining("hooks.jsonl")
    }));
    expect(usageCapture.calls).toHaveLength(1);
    expect(usageCapture.calls[0]).toEqual(expect.objectContaining({
      transcriptPath,
      transcriptEvidenceRef: "transcript.jsonl"
    }));
    expect(artifactCollector.calls[0]).toEqual(expect.objectContaining({
      transcriptPath: undefined
    }));
  });

  test("does not pass rejected transcripts to usage capture", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-transcript-rejected-"));
    const usageCapture = new RecordingUsageCapture();

    const runner = new BenchmarkRunner({
      hookInstaller: new RecordingHookInstaller(),
      harnessRunner: new RecordingHarnessRunner({
        exitCode: 0,
        processDiagnostics: processDiagnostics()
      }),
      artifactCollector: new FakeArtifactCollector(),
      workspaceProvisioner: new FilesystemWorkspaceProvisioner(),
      transcriptResolver: new RecordingTranscriptResolver({
        source: "unavailable",
        confidence: "none",
        unavailableReason: "transcript path was outside approved provider roots"
      }),
      usageCapture
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "codex",
      runId: "run_transcript_rejected",
      trialId: "trial_transcript_rejected",
      workspaceRoot: root
    });

    expect(result.artifact_paths?.transcript_path).toBeUndefined();
    expect(usageCapture.calls[0]).toEqual(expect.objectContaining({
      transcriptPath: undefined
    }));
  });

  test("uses the canonical transcript artifact ref for provider transcript usage evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-transcript-evidence-"));
    const transcriptPath = join(root, "provider", "session.jsonl");
    await mkdir(join(root, "provider"), { recursive: true });
    await writeFile(transcriptPath, jsonl(
      { timestamp: "2026-06-21T10:00:01.000Z", type: "turn_context", payload: { model: "gpt-5.3-codex" } },
      {
        timestamp: "2026-06-21T10:00:02.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 1000,
              cached_input_tokens: 100,
              output_tokens: 50,
              reasoning_output_tokens: 10,
              total_tokens: 1050
            }
          }
        }
      }
    ));

    const runner = new BenchmarkRunner({
      hookInstaller: new RecordingHookInstaller(),
      harnessRunner: new RecordingHarnessRunner({
        exitCode: 0,
        processDiagnostics: processDiagnostics()
      }),
      artifactCollector: new FakeArtifactCollector(),
      workspaceProvisioner: new FilesystemWorkspaceProvisioner(),
      transcriptResolver: new RecordingTranscriptResolver({
        transcriptPath,
        source: "hook_spool",
        confidence: "high"
      }),
      usageCapture: new CodexUsageCapture({})
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "codex",
      runId: "run_transcript_evidence",
      trialId: "trial_transcript_evidence",
      workspaceRoot: root
    });

    expect(result.usage?.tokens.total).toEqual(expect.objectContaining({
      value: 1050,
      evidence_refs: ["transcript.jsonl"]
    }));
  });
});

class RecordingTranscriptResolver implements TrialTranscriptResolverPort {
  public readonly calls: TrialTranscriptResolutionInput[] = [];

  public constructor(private readonly result: TrialTranscriptResolutionResult) {}

  public async resolve(input: TrialTranscriptResolutionInput): Promise<TrialTranscriptResolutionResult> {
    this.calls.push(input);
    return this.result;
  }
}

class RecordingUsageCapture implements NormalizedUsageCapturePort {
  public readonly calls: UsageCaptureContext[] = [];

  public async capture(context: UsageCaptureContext) {
    this.calls.push(context);
    return [];
  }

  public async captureUsage(context: UsageCaptureContext): Promise<UsageReport> {
    this.calls.push(context);
    return {
      llms: [],
      tokens: {
        total: null,
        input: null,
        output: null,
        cache_read: null,
        cache_write: null
      },
      cost: {
        total_usd: {
          value: null,
          unit: "usd",
          measurement_source: "unavailable",
          capture_source: "test_usage_capture",
          confidence: "none",
          unavailable_reason: "not relevant to transcript handoff test"
        }
      },
      subagents: [],
      skills: [],
      mcps: [],
      coverage: {
        model: "unavailable",
        tokens: "unavailable",
        cost: "unavailable",
        subagents: "unavailable",
        skills: "unavailable",
        mcp: "unavailable"
      }
    };
  }
}

class RecordingHarnessRunner implements HarnessRunnerPort {
  public readonly calls: HarnessRunnerInput[] = [];

  public constructor(private readonly result: HarnessRunnerResult) {}

  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    this.calls.push(input);
    return this.result;
  }
}

class RecordingHookInstaller implements InstallHarnessHooksPort {
  public readonly installCalls: InstallHarnessHooksInput[] = [];

  public async install(input: InstallHarnessHooksInput): Promise<HookInstallation> {
    this.installCalls.push(input);
    return { id: "installation_1", provider: input.harness, workspace: input.workspace, files: [] };
  }

  public async uninstall(): Promise<void> {}
}

function processDiagnostics() {
  return {
    stdout: "",
    stderr: "",
    exit: {
      executable: "codex",
      args: [],
      exit_code: 0,
      timed_out: false,
      started_at: "2026-06-21T10:00:00.000Z",
      ended_at: "2026-06-21T10:00:10.000Z",
      duration_ms: 10_000
    }
  };
}

function jsonl(...records: unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}
