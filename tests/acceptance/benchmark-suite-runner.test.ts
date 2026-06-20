import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FilesystemWorkspaceProvisioner } from "../../src/adapters/outbound/filesystem/filesystem-workspace-provisioner.js";
import { BenchmarkRunner } from "../../src/application/use-cases/run-benchmark.js";
import type { ArtifactCollectorInput, ArtifactCollectorPort } from "../../src/application/ports/artifact-collector-port.js";
import type {
  HarnessRunnerInput,
  HarnessRunnerPort,
  HarnessRunnerResult
} from "../../src/application/ports/harness-runner-port.js";
import type {
  HookInstallation,
  InstallHarnessHooksInput,
  InstallHarnessHooksPort
} from "../../src/application/ports/install-harness-hooks-port.js";
import benchmark from "../fixtures/benchmarks/login-validation.benchmark.json" with { type: "json" };

describe("benchmark suite runner", () => {
  test("runs one benchmark across Codex and Claude Code with isolated multi-trial aggregation", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-suite-runner-"));
    const hookInstaller = new RecordingHookInstaller();
    const harnessRunner = new RecordingHarnessRunner((input) => {
      if (input.harness === "codex" && input.trialId === "codex_trial_2") {
        return { exitCode: 1, stderr: "validation failed" };
      }

      return { exitCode: 0, stdout: "ok" };
    });
    const artifactCollector = new RecordingArtifactCollector();
    const runner = new BenchmarkRunner({
      hookInstaller,
      harnessRunner,
      artifactCollector,
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runBenchmark({
      benchmark,
      harnesses: ["codex", "claude_code"],
      trials: 2,
      runId: "run_suite_1",
      workspaceRoot: root
    });

    expect(harnessRunner.calls).toHaveLength(4);
    expect(harnessRunner.calls.map((call) => call.harness)).toEqual([
      "codex",
      "codex",
      "claude_code",
      "claude_code"
    ]);
    expect(harnessRunner.calls.every((call) => call.prompt === benchmark.prompt.text)).toBe(true);

    const trialIds = result.trials.map((trial) => trial.trialId);
    expect(new Set(trialIds).size).toBe(4);
    expect(trialIds).toEqual(["codex_trial_1", "codex_trial_2", "claude_code_trial_1", "claude_code_trial_2"]);

    const workspaces = result.trials.map((trial) => trial.workspace);
    expect(new Set(workspaces).size).toBe(4);
    expect(workspaces).toEqual(trialIds.map((trialId) => join(root, trialId)));
    expect(harnessRunner.calls.map((call) => call.workspace)).toEqual(workspaces);

    expect(result.trials.map(({ harness, trialId, status, failure_classification }) => ({
      harness,
      trialId,
      status,
      failure_classification
    }))).toEqual([
      { harness: "codex", trialId: "codex_trial_1", status: "completed", failure_classification: undefined },
      { harness: "codex", trialId: "codex_trial_2", status: "failed", failure_classification: "agent_failed" },
      {
        harness: "claude_code",
        trialId: "claude_code_trial_1",
        status: "completed",
        failure_classification: undefined
      },
      {
        harness: "claude_code",
        trialId: "claude_code_trial_2",
        status: "completed",
        failure_classification: undefined
      }
    ]);

    expect(hookInstaller.installCalls.map((call) => call.trialId)).toEqual(trialIds);
    expect(hookInstaller.uninstallCalls.map((call) => call.id)).toEqual(trialIds);
    expect(artifactCollector.calls.map((call) => call.trialId)).toEqual(trialIds);
  });
});

class RecordingHarnessRunner implements HarnessRunnerPort {
  public readonly calls: HarnessRunnerInput[] = [];

  public constructor(private readonly resultFor: (input: HarnessRunnerInput) => HarnessRunnerResult) {}

  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    this.calls.push(input);
    return this.resultFor(input);
  }
}

class RecordingHookInstaller implements InstallHarnessHooksPort {
  public readonly installCalls: InstallHarnessHooksInput[] = [];
  public readonly uninstallCalls: HookInstallation[] = [];

  public async install(input: InstallHarnessHooksInput): Promise<HookInstallation> {
    this.installCalls.push(input);
    return { id: input.trialId, provider: input.harness, workspace: input.workspace, files: [] };
  }

  public async uninstall(installation: HookInstallation): Promise<void> {
    this.uninstallCalls.push(installation);
  }
}

class RecordingArtifactCollector implements ArtifactCollectorPort {
  public readonly calls: ArtifactCollectorInput[] = [];

  public async collect(input: ArtifactCollectorInput): Promise<[]> {
    this.calls.push(input);
    return [];
  }
}
