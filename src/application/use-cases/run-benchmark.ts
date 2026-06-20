import type { ArtifactCollectorPort } from "../ports/artifact-collector-port.js";
import type { HookInstallation, InstallHarnessHooksPort } from "../ports/install-harness-hooks-port.js";
import type { HarnessName, HarnessRunnerPort } from "../ports/harness-runner-port.js";
import type { WorkspaceProvisionerPort } from "../ports/workspace-provisioner-port.js";

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

export interface RunBenchmarkInput {
  benchmark: BenchmarkDefinition;
  harnesses: readonly HarnessName[];
  trials: number;
  runId: string;
  workspaceRoot: string;
  strictTelemetry?: boolean;
}

export interface RunBenchmarkTrialResult extends RunTrialResult {
  harness: HarnessName;
  trialId: string;
  trialNumber: number;
}

export interface RunBenchmarkResult {
  runId: string;
  benchmarkId: string;
  benchmarkVersion: string;
  trials: RunBenchmarkTrialResult[];
}

export class BenchmarkRunner {
  public constructor(
    private readonly ports: {
      hookInstaller: InstallHarnessHooksPort;
      harnessRunner: HarnessRunnerPort;
      artifactCollector: ArtifactCollectorPort;
      workspaceProvisioner: WorkspaceProvisionerPort;
    }
  ) {}

  public async runTrial(input: RunTrialInput): Promise<RunTrialResult> {
    const { workspace, spoolPath } = await this.ports.workspaceProvisioner.provision({
      workspaceRoot: input.workspaceRoot,
      trialId: input.trialId
    });

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

  public async runBenchmark(input: RunBenchmarkInput): Promise<RunBenchmarkResult> {
    const trials: RunBenchmarkTrialResult[] = [];

    for (const harness of input.harnesses) {
      const trialCount = this.trialCountFor(input.trials, harness);

      for (let trialNumber = 1; trialNumber <= trialCount; trialNumber += 1) {
        const trialId = `${harness}_trial_${trialNumber}`;
        const result = await this.runTrial({
          benchmark: input.benchmark,
          harness,
          runId: input.runId,
          trialId,
          workspaceRoot: input.workspaceRoot,
          strictTelemetry: input.strictTelemetry
        });

        trials.push({
          harness,
          trialId,
          trialNumber,
          ...result
        });
      }
    }

    return {
      runId: input.runId,
      benchmarkId: input.benchmark.id,
      benchmarkVersion: input.benchmark.version,
      trials
    };
  }

  private trialCountFor(trials: number, harness: HarnessName): number {
    if (!Number.isInteger(trials) || trials < 0) {
      throw new Error(`invalid trial count for ${harness}: ${trials}`);
    }

    return trials;
  }
}
