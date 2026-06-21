import { describe, expect, test } from "vitest";

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
import type { SpecCatalogStore } from "../../src/application/ports/spec-catalog-store.js";
import type {
  ProvisionWorkspaceInput,
  WorkspaceProvisionerPort
} from "../../src/application/ports/workspace-provisioner-port.js";
import { ResolveBenchmarkPromptUseCase } from "../../src/application/use-cases/resolve-benchmark-prompt.js";
import { BenchmarkRunner } from "../../src/application/use-cases/run-benchmark.js";
import { RunSpecSuiteUseCase } from "../../src/application/use-cases/run-spec-suite.js";
import { ValidateSpecCatalogUseCase } from "../../src/application/use-cases/validate-spec-catalog.js";
import type { LoadedSpecCatalog } from "../../src/domain/benchmark/spec-catalog.js";

describe("spec suite application layer", () => {
  test("runs selected specs across harnesses and trials with spec-scoped trial ids", async () => {
    const promptReader = new InMemoryPromptReader();
    const harnessRunner = new RecordingHarnessRunner((input) =>
      input.trialId === "pricing-rounding_codex_trial_2"
        ? { exitCode: 1, stderr: "validation failed" }
        : { exitCode: 0, stdout: "ok" }
    );
    const artifactCollector = new RecordingArtifactCollector();
    const runner = new BenchmarkRunner({
      hookInstaller: new RecordingHookInstaller(),
      harnessRunner,
      promptResolver: new ResolveBenchmarkPromptUseCase(promptReader),
      artifactCollector,
      workspaceProvisioner: new RecordingWorkspaceProvisioner()
    });

    const report = await new RunSpecSuiteUseCase().execute({
      loadedCatalog: loadedCatalog(),
      runner,
      runId: "run_suite_application",
      catalogRoot: ".bmh/specs",
      harnesses: ["codex"],
      trials: 2,
      workspaceRoot: ".bmh/workspaces"
    });

    expect(harnessRunner.calls.map((call) => call.trialId)).toEqual([
      "login-validation_codex_trial_1",
      "login-validation_codex_trial_2",
      "pricing-rounding_codex_trial_1",
      "pricing-rounding_codex_trial_2"
    ]);
    expect(promptReader.roots).toEqual([
      ".bmh/specs/features/login-validation",
      ".bmh/specs/features/login-validation",
      ".bmh/specs/features/pricing-rounding",
      ".bmh/specs/features/pricing-rounding"
    ]);
    expect(artifactCollector.calls.map((call) => call.trialId)).toEqual(harnessRunner.calls.map((call) => call.trialId));
    expect(report.global_summary).toMatchObject({
      completed: 3,
      failed: 1,
      pass_rate_by_harness: {
        codex: 0.75
      }
    });
    expect(report.spec_summaries.map((summary) => summary.spec_id)).toEqual(["login-validation", "pricing-rounding"]);
    expect(report.trials[3]).toMatchObject({
      spec_id: "pricing-rounding",
      harness: "codex",
      status: "failed",
      artifact_refs: [
        "specs/pricing-rounding/codex/pricing-rounding_codex_trial_2/result.json",
        "specs/pricing-rounding/codex/pricing-rounding_codex_trial_2/diff.patch",
        "specs/pricing-rounding/codex/pricing-rounding_codex_trial_2/test-output.txt",
        "specs/pricing-rounding/codex/pricing-rounding_codex_trial_2/transcript.jsonl"
      ]
    });
  });

  test("validates catalog benchmarks with repo base refs and prompt files", async () => {
    const store = new InMemorySpecCatalogStore({
      ...loadedCatalog(),
      specs: [
        {
          ...loadedCatalog().specs[0],
          benchmark: {
            ...loadedCatalog().specs[0].benchmark,
            repo: {
              url: "file:///repo"
            }
          }
        }
      ]
    });

    const result = await new ValidateSpecCatalogUseCase(store).execute({
      catalogRoot: ".bmh/specs"
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["catalog benchmark login-validation must define repo.base_ref"]);
  });
});

function loadedCatalog(): LoadedSpecCatalog {
  return {
    catalog: {
      id: "core-regression-suite",
      name: "Core regression suite",
      version: "1.0.0",
      specs: [
        { id: "login-validation", path: "features/login-validation/benchmark.json", tags: ["auth"] },
        { id: "pricing-rounding", path: "features/pricing-rounding/benchmark.json", tags: ["billing"] }
      ],
      defaults: {
        trials: 3,
        harnesses: ["codex", "claude_code"],
        workspace_root: ".bmh/workspaces",
        strict_telemetry: false
      }
    },
    specs: [
      featureSpec("login-validation", ["auth"]),
      featureSpec("pricing-rounding", ["billing"])
    ]
  };
}

function featureSpec(id: string, tags: readonly string[]): LoadedSpecCatalog["specs"][number] {
  return {
    id,
      tags: [...tags],
    catalogPath: `features/${id}/benchmark.json`,
    featureDirectory: `.bmh/specs/features/${id}`,
    promptMarkdown: `# ${id}`,
    benchmark: {
      id,
      name: id,
      version: "1.0.0",
      category: "feature",
      tags: [...tags],
      repo: {
        url: "file:///repo",
        base_ref: "base",
        golden_ref: "golden",
        test_commands: ["npm test"]
      },
      prompt: {
        file: "spec.md"
      },
      expected_output: {
        tests_must_pass: true
      },
      limits: {
        timeout_seconds: 900
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
  public readonly roots: string[] = [];

  public async read(input: { root: string; path: string }): Promise<{ content: string; path: string; contentHash: string }> {
    this.roots.push(input.root);
    return {
      content: `prompt:${input.root}/${input.path}`,
      path: `${input.root}/${input.path}`,
      contentHash: "hash"
    };
  }
}

class RecordingHarnessRunner implements HarnessRunnerPort {
  public readonly calls: HarnessRunnerInput[] = [];

  public constructor(private readonly resultFor: (input: HarnessRunnerInput) => HarnessRunnerResult) {}

  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    this.calls.push(input);
    return this.resultFor(input);
  }
}

class RecordingHookInstaller implements InstallHarnessHooksPort {
  public async install(input: InstallHarnessHooksInput): Promise<HookInstallation> {
    return { id: input.trialId, provider: input.harness, workspace: input.workspace, files: [] };
  }

  public async uninstall(): Promise<void> {}
}

class RecordingArtifactCollector implements ArtifactCollectorPort {
  public readonly calls: ArtifactCollectorInput[] = [];

  public async collect(input: ArtifactCollectorInput): Promise<[]> {
    this.calls.push(input);
    return [];
  }
}

class RecordingWorkspaceProvisioner implements WorkspaceProvisionerPort {
  public async provision(input: ProvisionWorkspaceInput): Promise<{
    workspace: string;
    spoolPath: string;
    workspaceSource?: {
      type: "git";
      repo_url: string;
      base_ref: string;
      resolved_base_sha?: string;
      golden_ref?: string;
      resolved_golden_sha?: string;
    };
  }> {
    return {
      workspace: `${input.workspaceRoot}/${input.trialId}`,
      spoolPath: `${input.workspaceRoot}/${input.trialId}/events.jsonl`,
      workspaceSource: input.source?.type === "git"
        ? {
            type: "git",
            repo_url: input.source.repoUrl,
            base_ref: input.source.baseRef,
            resolved_base_sha: input.source.baseRef,
            golden_ref: input.source.goldenRef,
            resolved_golden_sha: input.source.goldenRef
          }
        : undefined
    };
  }
}

class InMemorySpecCatalogStore implements SpecCatalogStore {
  public constructor(private readonly catalog: LoadedSpecCatalog) {}

  public async createCatalog(): Promise<never> {
    throw new Error("not implemented");
  }

  public async loadCatalog(): Promise<LoadedSpecCatalog> {
    return this.catalog;
  }

  public async writeFeatureSpec(): Promise<never> {
    throw new Error("not implemented");
  }
}
