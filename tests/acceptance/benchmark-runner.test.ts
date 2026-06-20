import { describe, expect, test } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FilesystemWorkspaceProvisioner } from "../../src/adapters/outbound/filesystem/filesystem-workspace-provisioner.js";
import { BenchmarkRunner } from "../../src/application/use-cases/run-benchmark.js";
import { FakeHarnessRunner } from "../support/fakes/fake-harness-runner.js";
import { FakeHookInstaller } from "../support/fakes/fake-hook-installer.js";
import { FakeArtifactCollector } from "../support/fakes/fake-artifact-collector.js";
import benchmark from "../fixtures/benchmarks/login-validation.benchmark.json" with { type: "json" };

describe("benchmark runner", () => {
  test("creates an isolated workspace, installs instrumentation, runs harness, and uninstalls instrumentation", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-"));
    const hookInstaller = new FakeHookInstaller();
    const harnessRunner = new FakeHarnessRunner({ exitCode: 0 });
    const artifactCollector = new FakeArtifactCollector();
    const runner = new BenchmarkRunner({
      hookInstaller,
      harnessRunner,
      artifactCollector,
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "codex",
      runId: "run_1",
      trialId: "trial_1",
      workspaceRoot: root
    });

    expect(result.status).toBe("completed");
    expect(hookInstaller.installCalls).toHaveLength(1);
    expect(hookInstaller.uninstallCalls).toHaveLength(1);
    expect(harnessRunner.calls[0].prompt).toBe("Add input validation to the login form.");
    expect(artifactCollector.calls).toHaveLength(1);
  });

  test("uninstalls instrumentation when the harness fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-"));
    const hookInstaller = new FakeHookInstaller();
    const harnessRunner = new FakeHarnessRunner({ exitCode: 1 });
    const artifactCollector = new FakeArtifactCollector();
    const runner = new BenchmarkRunner({
      hookInstaller,
      harnessRunner,
      artifactCollector,
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "claude_code",
      runId: "run_1",
      trialId: "trial_1",
      workspaceRoot: root
    });

    expect(result.status).toBe("failed");
    expect(result.failure_classification).toBe("agent_failed");
    expect(hookInstaller.uninstallCalls).toHaveLength(1);
  });
});
