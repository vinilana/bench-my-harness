import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { FilesystemHookEventCounter } from "../../src/adapters/outbound/filesystem/filesystem-hook-event-counter.js";
import { FilesystemWorkspaceProvisioner } from "../../src/adapters/outbound/filesystem/filesystem-workspace-provisioner.js";
import { BenchmarkRunner } from "../../src/application/use-cases/run-benchmark.js";
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
import type {
  ValidationRunnerInput,
  ValidationRunnerPort,
  ValidationRunnerResult
} from "../../src/application/ports/validation-runner-port.js";
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

  test("executes validation commands after successful harness execution and forwards test output artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-validation-"));
    const events: string[] = [];
    const hookInstaller = new OrderedHookInstaller(events);
    const harnessRunner = new OrderedHarnessRunner({ exitCode: 0 }, events);
    const artifactCollector = new FakeArtifactCollector();
    const validationRunner = new RecordingValidationRunner({
      status: "passed",
      testOutputPath: ".bmh/validation-output.txt"
    }, events);
    const runner = new BenchmarkRunner({
      hookInstaller,
      harnessRunner,
      validationRunner,
      artifactCollector,
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "codex",
      runId: "run_validation",
      trialId: "trial_validation",
      workspaceRoot: root
    });

    expect(result.status).toBe("completed");
    expect(events).toEqual(["install", "harness", "validation", "uninstall"]);
    expect(validationRunner.calls).toHaveLength(1);
    expect(validationRunner.calls[0]).toMatchObject({
      runId: "run_validation",
      trialId: "trial_validation",
      harness: "codex",
      setupCommands: ["npm install"],
      validationCommands: ["npm test"]
    });
    expect(artifactCollector.calls).toHaveLength(1);
    expect(artifactCollector.calls[0]).toMatchObject({
      testOutputPath: ".bmh/validation-output.txt"
    });
  });

  test("classifies validation command failures as agent failures and still uninstalls hooks", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-validation-failure-"));
    const events: string[] = [];
    const hookInstaller = new OrderedHookInstaller(events);
    const validationRunner = new RecordingValidationRunner({
      status: "failed",
      failedPhase: "validation",
      exitCode: 1,
      testOutputPath: ".bmh/validation-output.txt"
    }, events);
    const runner = new BenchmarkRunner({
      hookInstaller,
      harnessRunner: new OrderedHarnessRunner({ exitCode: 0 }, events),
      validationRunner,
      artifactCollector: new FakeArtifactCollector(),
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "codex",
      runId: "run_validation_failure",
      trialId: "trial_validation_failure",
      workspaceRoot: root
    });

    expect(result.status).toBe("failed");
    expect(result.failure_classification).toBe("agent_failed");
    expect(hookInstaller.uninstallCalls).toHaveLength(1);
    expect(events).toEqual(["install", "harness", "validation", "uninstall"]);
  });

  test("records a note when harness-internal verification failed but BMH validation passed", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-internal-verification-"));
    const harnessRunner = new OrderedHarnessRunner({
      exitCode: 0,
      stdout: "Tests: 1 failed, 2 passed",
      processDiagnostics: {
        stdout: "Tests: 1 failed, 2 passed",
        stderr: "",
        exit: {
          executable: "fake-harness",
          args: [],
          exit_code: 0,
          timed_out: false,
          started_at: "2026-06-21T10:00:00.000Z",
          ended_at: "2026-06-21T10:00:01.000Z",
          duration_ms: 1000
        }
      }
    }, []);
    const runner = new BenchmarkRunner({
      hookInstaller: new FakeHookInstaller(),
      harnessRunner,
      validationRunner: new RecordingValidationRunner({ status: "passed" }),
      artifactCollector: new FakeArtifactCollector(),
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "codex",
      runId: "run_internal_verification",
      trialId: "trial_internal_verification",
      workspaceRoot: root
    });

    expect(result.status).toBe("completed");
    expect(result.notes).toContain(
      "harness-internal verification output contained failures; final BMH validation passed"
    );
  });

  test("classifies setup command failures as environment failures and still uninstalls hooks", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-setup-failure-"));
    const events: string[] = [];
    const hookInstaller = new OrderedHookInstaller(events);
    const validationRunner = new RecordingValidationRunner({
      status: "failed",
      failedPhase: "setup",
      exitCode: 127,
      testOutputPath: ".bmh/setup-output.txt"
    }, events);
    const runner = new BenchmarkRunner({
      hookInstaller,
      harnessRunner: new OrderedHarnessRunner({ exitCode: 0 }, events),
      validationRunner,
      artifactCollector: new FakeArtifactCollector(),
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "claude_code",
      runId: "run_setup_failure",
      trialId: "trial_setup_failure",
      workspaceRoot: root
    });

    expect(result.status).toBe("failed");
    expect(result.failure_classification).toBe("environment_failed");
    expect(hookInstaller.uninstallCalls).toHaveLength(1);
    expect(events).toEqual(["install", "harness", "validation", "uninstall"]);
  });

  test("does not execute validation when harness execution fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-skip-validation-"));
    const validationRunner = new RecordingValidationRunner({ status: "passed" });
    const runner = new BenchmarkRunner({
      hookInstaller: new FakeHookInstaller(),
      harnessRunner: new FakeHarnessRunner({ exitCode: 1 }),
      validationRunner,
      artifactCollector: new FakeArtifactCollector(),
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "codex",
      runId: "run_skip_validation",
      trialId: "trial_skip_validation",
      workspaceRoot: root
    });

    expect(result.status).toBe("failed");
    expect(result.failure_classification).toBe("agent_failed");
    expect(validationRunner.calls).toHaveLength(0);
  });

  test("derives interaction and tool metrics from captured hook spools", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-runner-hook-metrics-"));
    const runner = new BenchmarkRunner({
      hookInstaller: new FakeHookInstaller(),
      harnessRunner: new SpoolWritingHarnessRunner(),
      hookEventCounter: new FilesystemHookEventCounter(),
      artifactCollector: new FakeArtifactCollector(),
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runTrial({
      benchmark,
      harness: "codex",
      runId: "run_hook_metrics",
      trialId: "trial_hook_metrics",
      workspaceRoot: root
    });

    expect(result.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "agent_interactions_total", value: 1 }),
      expect.objectContaining({
        metric: "tool_calls_total",
        value: 1,
        evidence_refs: ["hooks.jsonl", "event:evt_hook_2"]
      }),
      expect.objectContaining({
        metric: "tool_calls_failed",
        value: 1,
        evidence_refs: ["hooks.jsonl", "event:evt_hook_3"]
      }),
      expect.objectContaining({
        metric: "tool_calls_by_type.Bash",
        value: 1,
        evidence_refs: ["hooks.jsonl", "event:evt_hook_2"]
      })
    ]));
  });
});

class SpoolWritingHarnessRunner implements HarnessRunnerPort {
  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    await mkdir(dirname(input.env.BMH_SPOOL_PATH), { recursive: true });
    await writeFile(
      input.env.BMH_SPOOL_PATH,
      jsonl(
        hookEnvelope(input, "UserPromptSubmit", {
          session_id: "session_1",
          turn_id: "turn_1"
        }),
        hookEnvelope(input, "PreToolUse", {
          session_id: "session_1",
          turn_id: "turn_1",
          tool_name: "Bash",
          tool_use_id: "tool_1"
        }),
        hookEnvelope(input, "PostToolUse", {
          session_id: "session_1",
          turn_id: "turn_1",
          tool_name: "Bash",
          tool_use_id: "tool_1",
          tool_response: { exit_code: 1 }
        }),
        hookEnvelope(input, "Stop", {
          session_id: "session_1",
          turn_id: "turn_1"
        })
      ),
      "utf8"
    );

    return {
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      processDiagnostics: {
        stdout: "ok",
        stderr: "",
        exit: {
          executable: "fake-harness",
          args: [],
          exit_code: 0,
          timed_out: false,
          started_at: "2026-06-21T10:00:00.000Z",
          ended_at: "2026-06-21T10:00:01.000Z",
          duration_ms: 1000
        }
      }
    };
  }
}

class OrderedHarnessRunner implements HarnessRunnerPort {
  public readonly calls: HarnessRunnerInput[] = [];

  public constructor(
    private readonly result: HarnessRunnerResult,
    private readonly events: string[]
  ) {}

  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    this.events.push("harness");
    this.calls.push(input);
    return this.result;
  }
}

class OrderedHookInstaller implements InstallHarnessHooksPort {
  public readonly installCalls: InstallHarnessHooksInput[] = [];
  public readonly uninstallCalls: HookInstallation[] = [];

  public constructor(private readonly events: string[]) {}

  public async install(input: InstallHarnessHooksInput): Promise<HookInstallation> {
    this.events.push("install");
    this.installCalls.push(input);
    return { id: "installation_1", provider: input.harness, workspace: input.workspace, files: [] };
  }

  public async uninstall(installation: HookInstallation): Promise<void> {
    this.events.push("uninstall");
    this.uninstallCalls.push(installation);
  }
}

class RecordingValidationRunner implements ValidationRunnerPort {
  public readonly calls: ValidationRunnerInput[] = [];

  public constructor(
    private readonly result: ValidationRunnerResult,
    private readonly events: string[] = []
  ) {}

  public async execute(input: ValidationRunnerInput): Promise<ValidationRunnerResult> {
    this.calls.push(input);
    this.events.push("validation");
    return this.result;
  }
}

function hookEnvelope(
  input: HarnessRunnerInput,
  event: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    schema_version: "bmh.hook_capture.v1",
    provider: input.harness,
    event,
    run_id: input.runId,
    trial_id: input.trialId,
    captured_at: "2026-06-21T10:00:00.500Z",
    payload
  };
}

function jsonl(...records: readonly unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}
