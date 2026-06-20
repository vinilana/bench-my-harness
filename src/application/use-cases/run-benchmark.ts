import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ArtifactCollectorPort } from "../ports/artifact-collector-port.js";
import type { HookInstallation, InstallHarnessHooksPort } from "../ports/install-harness-hooks-port.js";
import type { HarnessName, HarnessRunnerPort } from "../ports/harness-runner-port.js";

interface BenchmarkPrompt {
  text: string;
}

interface BenchmarkDefinition {
  id: string;
  version: string;
  prompt: BenchmarkPrompt;
  limits?: {
    timeout_seconds?: number;
  };
}

export interface RunTrialInput {
  benchmark: BenchmarkDefinition;
  harness: HarnessName;
  runId: string;
  trialId: string;
  workspaceRoot: string;
  strictTelemetry?: boolean;
}

export type TrialFailureClassification =
  | "agent_failed"
  | "environment_failed"
  | "timeout"
  | "budget_exceeded"
  | "adapter_failed"
  | "inconclusive";

export interface RunTrialResult {
  status: "completed" | "failed";
  failure_classification?: TrialFailureClassification;
  workspace: string;
}

export class BenchmarkRunner {
  public constructor(
    private readonly ports: {
      hookInstaller: InstallHarnessHooksPort;
      harnessRunner: HarnessRunnerPort;
      artifactCollector: ArtifactCollectorPort;
    }
  ) {}

  public async runTrial(input: RunTrialInput): Promise<RunTrialResult> {
    const workspace = join(input.workspaceRoot, input.trialId);
    const spoolPath = join(workspace, ".bmh", "hooks.jsonl");
    await mkdir(join(workspace, ".bmh"), { recursive: true });

    let installation: HookInstallation | undefined;
    let result: RunTrialResult;

    try {
      installation = await this.ports.hookInstaller.install({
        harness: input.harness,
        runId: input.runId,
        trialId: input.trialId,
        workspace,
        spoolPath,
        strictTelemetry: input.strictTelemetry ?? false,
        benchmarkId: input.benchmark.id,
        benchmarkVersion: input.benchmark.version
      });

      const harnessResult = await this.ports.harnessRunner.execute({
        harness: input.harness,
        prompt: input.benchmark.prompt.text,
        workspace,
        runId: input.runId,
        trialId: input.trialId,
        env: {
          BMH_RUN_ID: input.runId,
          BMH_TRIAL_ID: input.trialId,
          BMH_HARNESS: input.harness,
          BMH_PROVIDER: input.harness,
          BMH_INGEST_MODE: "spool_file",
          BMH_SPOOL_PATH: spoolPath,
          BMH_STRICT_TELEMETRY: String(input.strictTelemetry ?? false),
          BMH_BENCHMARK_ID: input.benchmark.id,
          BMH_BENCHMARK_VERSION: input.benchmark.version
        },
        timeoutSeconds: input.benchmark.limits?.timeout_seconds
      });

      await this.ports.artifactCollector.collect({
        runId: input.runId,
        trialId: input.trialId,
        workspace,
        transcriptPath: harnessResult.transcriptPath,
        diffPath: harnessResult.diffPath,
        testOutputPath: harnessResult.testOutputPath
      });

      if (harnessResult.timedOut) {
        result = { status: "failed", failure_classification: "timeout", workspace };
      } else if (harnessResult.exitCode !== 0) {
        result = { status: "failed", failure_classification: "agent_failed", workspace };
      } else {
        result = { status: "completed", workspace };
      }
    } catch {
      result = { status: "failed", failure_classification: "adapter_failed", workspace };
    }

    if (installation) {
      try {
        await this.ports.hookInstaller.uninstall(installation);
      } catch {
        return { status: "failed", failure_classification: "adapter_failed", workspace };
      }
    }

    return result;
  }
}
