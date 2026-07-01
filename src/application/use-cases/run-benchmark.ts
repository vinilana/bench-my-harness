import type { ArtifactCollectorPort } from "../ports/artifact-collector-port.js";
import type {
  BenchmarkTrialRunnerPort,
  BenchmarkTrialDefinition,
  RunTrialInput,
  RunTrialResult
} from "../ports/benchmark-trial-runner-port.js";
import type { DiffGeneratorPort } from "../ports/diff-generator-port.js";
import type { HookEventCounterPort } from "../ports/hook-event-counter-port.js";
import type { HookInstallation, InstallHarnessHooksPort } from "../ports/install-harness-hooks-port.js";
import type { HarnessName, HarnessRunnerPort, ProcessDiagnostics } from "../ports/harness-runner-port.js";
import type { ValidationRunnerPort, ValidationRunnerResult } from "../ports/validation-runner-port.js";
import type { MetricObservation, NormalizedUsageCapturePort, UsageReport } from "../ports/usage-capture-port.js";
import type { TrialTranscriptResolverPort } from "../ports/trial-transcript-resolver-port.js";
import type {
  ProvisionWorkspaceInput,
  WorkspaceProvisionerPort,
  WorkspaceSource,
  WorkspaceSourceProvenance
} from "../ports/workspace-provisioner-port.js";
import type { ResolveBenchmarkPromptUseCase } from "./resolve-benchmark-prompt.js";

export interface RunBenchmarkInput {
  benchmark: BenchmarkTrialDefinition;
  harnesses: readonly HarnessName[];
  trials: number;
  runId: string;
  workspaceRoot: string;
  benchmarkRoot?: string;
  promptRoot?: string;
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

export class BenchmarkRunner implements BenchmarkTrialRunnerPort {
  public constructor(
    private readonly ports: {
      hookInstaller: InstallHarnessHooksPort;
      harnessRunner: HarnessRunnerPort;
      promptResolver?: ResolveBenchmarkPromptUseCase;
      validationRunner?: ValidationRunnerPort;
      diffGenerator?: DiffGeneratorPort;
      hookEventCounter?: HookEventCounterPort;
      usageCapture?: NormalizedUsageCapturePort;
      transcriptResolver?: TrialTranscriptResolverPort;
      artifactCollector: ArtifactCollectorPort;
      workspaceProvisioner: WorkspaceProvisionerPort;
    }
  ) {}

  public async runTrial(input: RunTrialInput): Promise<RunTrialResult> {
    const requestedSource = workspaceSourceFor(input.benchmark);
    const { workspace, spoolPath, workspaceSource } = await this.ports.workspaceProvisioner.provision(
      provisionWorkspaceInput(input, requestedSource)
    );

    let installation: HookInstallation | undefined;
    let result: RunTrialResult;
    const artifactPaths: NonNullable<RunTrialResult["artifact_paths"]> = {
      hook_spool_path: spoolPath
    };

    try {
      if (requestedSource?.type === "git" && workspaceSource?.resolved_base_sha === undefined) {
        return {
          status: "failed",
          failure_classification: "environment_failed",
          workspace,
          workspace_source: workspaceSource,
          artifact_paths: artifactPaths
        };
      }

      const resolvedPrompt = await this.resolvePrompt(input);

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
        prompt: resolvedPrompt,
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

      const harnessSucceeded = !harnessResult.timedOut && harnessResult.exitCode === 0;
      let validationResult: ValidationRunnerResult | undefined;
      let testOutputPath = harnessResult.testOutputPath;
      let diffPath = harnessResult.diffPath;
      const transcriptResolution = await this.resolveTranscriptIfConfigured({
        input,
        workspace,
        spoolPath,
        harnessTranscriptPath: harnessResult.transcriptPath,
        processDiagnostics: harnessResult.processDiagnostics
      });
      const resolvedTranscriptPath = transcriptResolution === undefined
        ? harnessResult.transcriptPath
        : transcriptResolution.transcriptPath;
      const artifactCollectorTranscriptPath = transcriptResolution === undefined
        ? harnessResult.transcriptPath
        : transcriptResolution.workspaceLocalTranscriptPath;
      artifactPaths.transcript_path = resolvedTranscriptPath;
      artifactPaths.status_line_jsonl_path = harnessResult.statusLineJsonlPath;
      artifactPaths.otel_jsonl_path = harnessResult.otelJsonlPath;

      if (harnessSucceeded) {
        validationResult = await this.runValidationIfConfigured(input, workspace);
        testOutputPath = validationResult?.testOutputPath ?? testOutputPath;
      }

      diffPath = await this.generateDiffIfConfigured(workspace, diffPath, workspaceSource);
      artifactPaths.diff_path = diffPath;
      artifactPaths.test_output_path = testOutputPath;

      await this.ports.artifactCollector.collect({
        runId: input.runId,
        trialId: input.trialId,
        workspace,
        transcriptPath: artifactCollectorTranscriptPath,
        statusLineJsonlPath: harnessResult.statusLineJsonlPath,
        otelJsonlPath: harnessResult.otelJsonlPath,
        diffPath,
        testOutputPath
      });
      const hookEventCount = await this.countHookEvents(spoolPath);
      const hookMetrics = await this.hookMetrics({
        input,
        spoolPath,
        observedAt: harnessResult.processDiagnostics?.exit.ended_at ?? new Date().toISOString()
      });
      const usage = await this.captureUsageIfConfigured({
        input,
        workspace,
        spoolPath,
        transcriptPath: resolvedTranscriptPath,
        statusLineJsonlPath: harnessResult.statusLineJsonlPath,
        otelJsonlPath: harnessResult.otelJsonlPath,
        processDiagnostics: harnessResult.processDiagnostics
      });

      if (harnessResult.timedOut) {
        result = {
          status: "failed",
          failure_classification: "timeout",
          workspace,
          workspace_source: workspaceSource,
          process_diagnostics: harnessResult.processDiagnostics,
          hook_command: installation.hookCommand,
          hook_event_count: hookEventCount,
          metrics: hookMetrics,
          usage,
          notes: [],
          artifact_paths: artifactPaths
        };
      } else if (harnessResult.exitCode !== 0) {
        result = {
          status: "failed",
          failure_classification: harnessResult.failureClassification ?? "agent_failed",
          workspace,
          workspace_source: workspaceSource,
          process_diagnostics: harnessResult.processDiagnostics,
          hook_command: installation.hookCommand,
          hook_event_count: hookEventCount,
          metrics: hookMetrics,
          usage,
          notes: [],
          artifact_paths: artifactPaths
        };
      } else if (validationResult?.status === "failed") {
        result = {
          status: "failed",
          failure_classification: validationResult.failedPhase === "setup" ? "environment_failed" : "agent_failed",
          workspace,
          workspace_source: workspaceSource,
          process_diagnostics: harnessResult.processDiagnostics,
          hook_command: installation.hookCommand,
          hook_event_count: hookEventCount,
          metrics: hookMetrics,
          usage,
          notes: [],
          artifact_paths: artifactPaths
        };
      } else {
        result = {
          status: "completed",
          workspace,
          workspace_source: workspaceSource,
          process_diagnostics: harnessResult.processDiagnostics,
          hook_command: installation.hookCommand,
          hook_event_count: hookEventCount,
          metrics: hookMetrics,
          usage,
          notes: harnessInternalVerificationNotes(harnessResult.processDiagnostics, validationResult),
          artifact_paths: artifactPaths
        };
      }
    } catch {
      result = {
        status: "failed",
        failure_classification: "adapter_failed",
        workspace,
        workspace_source: workspaceSource,
        artifact_paths: artifactPaths
      };
    }

    if (installation) {
      try {
        await this.ports.hookInstaller.uninstall(installation);
      } catch {
        return {
          status: "failed",
          failure_classification: "adapter_failed",
          workspace,
          workspace_source: workspaceSource,
          artifact_paths: artifactPaths
        };
      }
    }

    return result;
  }

  private async countHookEvents(spoolPath: string): Promise<number | undefined> {
    return this.ports.hookEventCounter?.count({ spoolPath });
  }

  private async hookMetrics(input: {
    readonly input: RunTrialInput;
    readonly spoolPath: string;
    readonly observedAt: string;
  }) {
    return this.ports.hookEventCounter?.metrics?.({
      spoolPath: input.spoolPath,
      provider: input.input.harness,
      runId: input.input.runId,
      trialId: input.input.trialId,
      observedAt: input.observedAt
    });
  }

  private async resolveTranscriptIfConfigured(input: {
    readonly input: RunTrialInput;
    readonly workspace: string;
    readonly spoolPath: string;
    readonly harnessTranscriptPath?: string;
    readonly processDiagnostics?: ProcessDiagnostics;
  }) {
    return this.ports.transcriptResolver?.resolve({
      harness: input.input.harness,
      runId: input.input.runId,
      trialId: input.input.trialId,
      workspace: input.workspace,
      hookSpoolPath: input.spoolPath,
      harnessTranscriptPath: input.harnessTranscriptPath,
      processDiagnostics: input.processDiagnostics
    });
  }

  private async captureUsageIfConfigured(input: {
    readonly input: RunTrialInput;
    readonly workspace: string;
    readonly spoolPath: string;
    readonly transcriptPath?: string;
    readonly statusLineJsonlPath?: string;
    readonly otelJsonlPath?: string;
    readonly processDiagnostics?: ProcessDiagnostics;
  }): Promise<UsageReport | undefined> {
    return this.ports.usageCapture?.captureUsage({
      provider: input.input.harness,
      runId: input.input.runId,
      trialId: input.input.trialId,
      workspace: input.workspace,
      hookSpoolPath: input.spoolPath,
      transcriptPath: input.transcriptPath,
      transcriptEvidenceRef: input.transcriptPath === undefined ? undefined : "transcript.jsonl",
      statusLineJsonlPath: input.statusLineJsonlPath,
      otelJsonlPath: input.otelJsonlPath,
      processStdout: input.processDiagnostics?.stdout,
      processStderr: input.processDiagnostics?.stderr
    });
  }

  private async generateDiffIfConfigured(
    workspace: string,
    existingDiffPath: string | undefined,
    workspaceSource: WorkspaceSourceProvenance | undefined
  ): Promise<string | undefined> {
    if (
      existingDiffPath !== undefined ||
      workspaceSource?.type !== "git" ||
      this.ports.diffGenerator === undefined
    ) {
      return existingDiffPath;
    }

    return (await this.ports.diffGenerator.generate({ workspace })).diffPath;
  }

  private async runValidationIfConfigured(
    input: RunTrialInput,
    workspace: string
  ): Promise<ValidationRunnerResult | undefined> {
    const validationRunner = this.ports.validationRunner;

    if (!validationRunner) {
      return undefined;
    }

    const commandSource = input.benchmark.repo ?? input.benchmark.fixture;
    const setupCommands = commandSource?.setup_commands ?? [];
    const validationCommands = commandSource?.test_commands ?? [];

    if (setupCommands.length === 0 && validationCommands.length === 0) {
      return undefined;
    }

    return validationRunner.execute({
      runId: input.runId,
      trialId: input.trialId,
      harness: input.harness,
      workspace,
      setupCommands,
      validationCommands,
      timeoutSeconds: input.benchmark.limits?.timeout_seconds
    });
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
          benchmarkRoot: input.benchmarkRoot,
          promptRoot: input.promptRoot,
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

  private async resolvePrompt(input: RunTrialInput): Promise<string> {
    if (typeof input.benchmark.prompt.text === "string") {
      return input.benchmark.prompt.text;
    }

    if (typeof input.benchmark.prompt.file === "string") {
      const promptResolver = this.ports.promptResolver;

      if (!promptResolver) {
        throw new Error("Prompt file resolver is required for benchmark prompt.file");
      }

      return (await promptResolver.execute({
        benchmark: input.benchmark,
        root: input.promptRoot ?? input.benchmarkRoot ?? input.workspaceRoot
      })).text;
    }

    throw new Error("Benchmark prompt must define text or file");
  }
}

function workspaceSourceFor(benchmark: BenchmarkTrialDefinition): WorkspaceSource | undefined {
  if (benchmark.repo?.url === undefined || benchmark.repo.base_ref === undefined) {
    return undefined;
  }

  return {
    type: "git",
    repoUrl: benchmark.repo.url,
    baseRef: benchmark.repo.base_ref,
    goldenRef: benchmark.repo.golden_ref
  };
}

function harnessInternalVerificationNotes(
  diagnostics: ProcessDiagnostics | undefined,
  validationResult: ValidationRunnerResult | undefined
): string[] {
  if (validationResult?.status !== "passed" || diagnostics === undefined) {
    return [];
  }

  const output = `${diagnostics.stdout}\n${diagnostics.stderr}`;
  if (!containsHarnessInternalVerificationFailure(output)) {
    return [];
  }

  return ["harness-internal verification output contained failures; final BMH validation passed"];
}

function containsHarnessInternalVerificationFailure(output: string): boolean {
  return /\bFAIL\b/.test(output)
    || /\b[1-9]\d*\s+failed\b/i.test(output)
    || /listen\s+EPERM/i.test(output);
}

function provisionWorkspaceInput(input: RunTrialInput, source: WorkspaceSource | undefined): ProvisionWorkspaceInput {
  const provisionInput: ProvisionWorkspaceInput = {
    workspaceRoot: input.workspaceRoot,
    trialId: input.trialId
  };

  if (source !== undefined) {
    provisionInput.source = source;
  }

  return provisionInput;
}
