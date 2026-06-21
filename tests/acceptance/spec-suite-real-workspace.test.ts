import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { FilesystemWorkspaceProvisioner } from "../../src/adapters/outbound/filesystem/filesystem-workspace-provisioner.js";
import { FilesystemSuiteResultStore } from "../../src/adapters/outbound/storage/filesystem-suite-result-store.js";
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
import type { PromptFileReaderPort } from "../../src/application/ports/prompt-file-reader-port.js";
import type {
  ValidationRunnerInput,
  ValidationRunnerPort,
  ValidationRunnerResult
} from "../../src/application/ports/validation-runner-port.js";
import { ResolveBenchmarkPromptUseCase } from "../../src/application/use-cases/resolve-benchmark-prompt.js";
import { BenchmarkRunner } from "../../src/application/use-cases/run-benchmark.js";
import { RunSpecSuiteUseCase } from "../../src/application/use-cases/run-spec-suite.js";
import type { LoadedSpecCatalog } from "../../src/domain/benchmark/spec-catalog.js";
import { createLocalGitFixture, git } from "../support/git-fixture.js";

describe("spec suite real git workspaces", () => {
  test("creates one checkout per spec, harness, and trial and persists per-trial results under run artifacts", async () => {
    const fixture = await createLocalGitFixture();
    const runId = "run_real_git_suite";
    const workspaceRoot = join(fixture.root, ".bmh", "workspaces");
    const runsRoot = join(fixture.root, ".bmh", "runs");
    const harnessRunner = new FakeProcessHarnessRunner(fixture.baseFile);
    const runner = new BenchmarkRunner({
      hookInstaller: new RecordingHookInstaller(),
      harnessRunner,
      promptResolver: new ResolveBenchmarkPromptUseCase(new InMemoryPromptReader()),
      validationRunner: new RecordingValidationRunner(fixture.baseFile),
      artifactCollector: new RecordingArtifactCollector(),
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const report = await new RunSpecSuiteUseCase(new FilesystemSuiteResultStore({ root: runsRoot })).execute({
      loadedCatalog: loadedCatalog(fixture.repoUrl, fixture.baseSha, fixture.goldenSha),
      runner,
      runId,
      catalogRoot: ".bmh/specs",
      harnesses: ["codex", "claude_code"],
      trials: 2,
      workspaceRoot
    });

    const trialIds = report.trials.map((trial) => trial.trial_id);
    expect(trialIds).toEqual([
      "login-validation_codex_trial_1",
      "login-validation_codex_trial_2",
      "login-validation_claude_code_trial_1",
      "login-validation_claude_code_trial_2",
      "pricing-rounding_codex_trial_1",
      "pricing-rounding_codex_trial_2",
      "pricing-rounding_claude_code_trial_1",
      "pricing-rounding_claude_code_trial_2"
    ]);
    expect(new Set(report.trials.map((trial) => trial.workspace)).size).toBe(trialIds.length);
    expect(harnessRunner.initialHeads).toEqual(trialIds.map((trialId) => ({
      trialId,
      head: fixture.baseSha
    })));

    for (const trial of report.trials) {
      expect(trial.status).toBe("completed");
      expect(trial.workspace).toBe(join(workspaceRoot, trial.trial_id));
      expect(trial.workspace_source).toMatchObject({
        type: "git",
        repo_url: fixture.repoUrl,
        base_ref: fixture.baseSha,
        resolved_base_sha: fixture.baseSha,
        golden_ref: fixture.goldenSha,
        resolved_golden_sha: fixture.goldenSha
      });
      await expect(readFile(join(trial.workspace ?? "", fixture.baseFile), "utf8")).resolves.toContain("agent edit");
      await expect(access(join(trial.workspace ?? "", fixture.goldenOnlyFile))).rejects.toThrow();
      await expect(readFile(join(runsRoot, runId, "specs", trial.spec_id, trial.harness, trial.trial_id, "result.json"), "utf8"))
        .resolves.toContain(trial.trial_id);
    }
  });

  test("marks a git-backed suite comparable when validation passes and required metric source conditions are satisfied", async () => {
    const fixture = await createLocalGitFixture();
    const runner = new BenchmarkRunner({
      hookInstaller: new RecordingHookInstaller(),
      harnessRunner: new FakeProcessHarnessRunner(fixture.baseFile),
      promptResolver: new ResolveBenchmarkPromptUseCase(new InMemoryPromptReader()),
      validationRunner: new RecordingValidationRunner(fixture.baseFile),
      artifactCollector: new RecordingArtifactCollector(),
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const report = await new RunSpecSuiteUseCase().execute({
      loadedCatalog: loadedCatalog(fixture.repoUrl, fixture.baseSha, fixture.goldenSha, ["login-validation"]),
      runner,
      runId: "run_real_git_comparable",
      catalogRoot: ".bmh/specs",
      harnesses: ["codex"],
      trials: 1,
      workspaceRoot: join(fixture.root, ".bmh", "workspaces")
    });

    expect(report.trials).toHaveLength(1);
    expect(report.trials[0].comparability).toEqual({ status: "comparable", reasons: [] });
    expect(report.comparability).toEqual({ status: "comparable", reasons: [] });
    expect(report.global_summary.comparability_status).toBe("comparable");
  });
});

function loadedCatalog(
  repoUrl: string,
  baseRef: string,
  goldenRef: string,
  specIds: readonly string[] = ["login-validation", "pricing-rounding"]
): LoadedSpecCatalog {
  return {
    catalog: {
      id: "real-git-suite",
      name: "Real git suite",
      version: "1.0.0",
      specs: specIds.map((id) => ({ id, path: `features/${id}/benchmark.json`, tags: [id] })),
      defaults: {
        trials: 2,
        harnesses: ["codex", "claude_code"],
        workspace_root: ".bmh/workspaces",
        strict_telemetry: false
      }
    },
    specs: specIds.map((id) => featureSpec(id, repoUrl, baseRef, goldenRef))
  };
}

function featureSpec(id: string, repoUrl: string, baseRef: string, goldenRef: string): LoadedSpecCatalog["specs"][number] {
  return {
    id,
    tags: [id],
    catalogPath: `features/${id}/benchmark.json`,
    featureDirectory: `.bmh/specs/features/${id}`,
    promptMarkdown: `# ${id}`,
    benchmark: {
      id,
      name: id,
      version: "1.0.0",
      category: "feature",
      tags: [id],
      repo: {
        url: repoUrl,
        base_ref: baseRef,
        golden_ref: goldenRef,
        test_commands: ["npm test"]
      },
      prompt: {
        file: "spec.md"
      },
      expected_output: {
        tests_must_pass: true
      },
      limits: {
        timeout_seconds: 60
      },
      evaluation: {
        scoring: {
          tests: 1
        }
      }
    }
  };
}

class InMemoryPromptReader implements PromptFileReaderPort {
  public async read(input: { root: string; path: string }): Promise<{ content: string; path: string; contentHash: string }> {
    return {
      content: `prompt:${input.root}/${input.path}`,
      path: `${input.root}/${input.path}`,
      contentHash: "hash"
    };
  }
}

class FakeProcessHarnessRunner implements HarnessRunnerPort {
  public readonly calls: HarnessRunnerInput[] = [];
  public readonly initialHeads: { trialId: string; head: string }[] = [];

  public constructor(private readonly fileToChange: string) {}

  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    this.calls.push(input);
    this.initialHeads.push({
      trialId: input.trialId,
      head: await git(["rev-parse", "HEAD"], input.workspace)
    });
    await writeFile(join(input.workspace, this.fileToChange), `agent edit for ${input.trialId}\n`, "utf8");
    return { exitCode: 0, transcriptPath: ".bmh/transcript.jsonl" };
  }
}

class RecordingHookInstaller implements InstallHarnessHooksPort {
  public readonly installCalls: InstallHarnessHooksInput[] = [];

  public async install(input: InstallHarnessHooksInput): Promise<HookInstallation> {
    this.installCalls.push(input);
    return { id: input.trialId, provider: input.harness, workspace: input.workspace, files: [] };
  }

  public async uninstall(): Promise<void> {}
}

class RecordingValidationRunner implements ValidationRunnerPort {
  public readonly calls: ValidationRunnerInput[] = [];

  public constructor(private readonly changedFile: string) {}

  public async execute(input: ValidationRunnerInput): Promise<ValidationRunnerResult> {
    this.calls.push(input);
    await expect(readFile(join(input.workspace, this.changedFile), "utf8")).resolves.toContain("agent edit");
    return { status: "passed", testOutputPath: ".bmh/validation-output.txt" };
  }
}

class RecordingArtifactCollector implements ArtifactCollectorPort {
  public readonly calls: ArtifactCollectorInput[] = [];

  public async collect(input: ArtifactCollectorInput): Promise<[]> {
    this.calls.push(input);
    return [];
  }
}
