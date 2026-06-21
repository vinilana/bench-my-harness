import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

import { FilesystemSuiteResultStore } from "../../src/adapters/outbound/storage/filesystem-suite-result-store.js";
import type { ArtifactCollectorInput, ArtifactCollectorPort } from "../../src/application/ports/artifact-collector-port.js";
import type { DiffGeneratorPort } from "../../src/application/ports/diff-generator-port.js";
import type {
  HarnessRunnerInput,
  HarnessRunnerPort,
  HarnessRunnerResult,
  ProcessDiagnostics
} from "../../src/application/ports/harness-runner-port.js";
import type {
  HookInstallation,
  InstallHarnessHooksInput,
  InstallHarnessHooksPort
} from "../../src/application/ports/install-harness-hooks-port.js";
import type { ValidationRunnerPort } from "../../src/application/ports/validation-runner-port.js";
import type {
  ProvisionWorkspaceInput,
  WorkspaceProvisionerPort
} from "../../src/application/ports/workspace-provisioner-port.js";
import { BenchmarkRunner } from "../../src/application/use-cases/run-benchmark.js";
import type { RunTrialResult } from "../../src/application/use-cases/run-benchmark.js";
import type { LoadedSpecCatalog } from "../../src/domain/benchmark/spec-catalog.js";
import type { SuiteReport, SuiteTrialReport } from "../../src/domain/reports/suite-report.js";

describe("spec suite artifact finalization", () => {
  test("persists only existing artifact refs and writes an artifact index", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-suite-artifacts-"));
    const runsRoot = join(root, "runs");
    const workspaceRoot = join(root, "workspaces");

    const catalog = loadedCatalog({ withValidationCommands: true });
    const runner = new BenchmarkRunner({
      hookInstaller: new RecordingHookInstaller(),
      harnessRunner: new ArtifactWritingHarnessRunner(),
      validationRunner: new TestOutputValidationRunner(),
      diffGenerator: new DiffWritingGenerator(),
      hookEventCounter: new JsonlHookCounter(),
      artifactCollector: new RecordingArtifactCollector(),
      workspaceProvisioner: new DirectoryWorkspaceProvisioner()
    });
    const runId = "run_artifact_finalization";
    const trialId = "artifact-integrity_codex_trial_1";
    const result = await runner.runTrial({
      benchmark: catalog.specs[0].benchmark,
      harness: "codex",
      runId,
      trialId,
      workspaceRoot
    });
    const trial = trialReport(result, trialId);

    await new FilesystemSuiteResultStore({ root: runsRoot }).save({
      runId,
      trials: [trial],
      report: suiteReport(runId, [trial]),
      processDiagnostics: result.process_diagnostics === undefined
        ? []
        : [{ spec_id: "artifact-integrity", harness: "codex", trial_id: trialId, diagnostics: result.process_diagnostics }],
      artifactFinalizations: [{
        spec_id: "artifact-integrity",
        harness: "codex",
        trial_id: trialId,
        workspace: result.workspace,
        hook_spool_path: result.artifact_paths?.hook_spool_path,
        transcript_path: result.artifact_paths?.transcript_path,
        diff_path: result.artifact_paths?.diff_path,
        test_output_path: result.artifact_paths?.test_output_path
      }]
    });

    const trialDir = join(
      runsRoot,
      "run_artifact_finalization",
      "specs",
      "artifact-integrity",
      "codex",
      "artifact-integrity_codex_trial_1"
    );
    const savedResult = await readJson<{ artifact_refs: string[] }>(join(trialDir, "result.json"));
    const index = await readJson<{ artifacts: { ref: string; exists: boolean; kind: string }[] }>(
      join(trialDir, "artifact-index.json")
    );

    expect(savedResult.artifact_refs).toEqual([
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/result.json",
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/process-stdout.txt",
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/process-stderr.txt",
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/process-exit.json",
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/hooks.jsonl",
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/transcript.jsonl",
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/diff.patch",
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/test-output.txt",
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/artifact-index.json"
    ]);
    await expectExistingRefs(join(runsRoot, runId), savedResult.artifact_refs);
    await expect(readFile(join(trialDir, "hooks.jsonl"), "utf8")).resolves.toContain("\"event\":\"Stop\"");
    await expect(readFile(join(trialDir, "diff.patch"), "utf8")).resolves.toContain("diff --git");
    await expect(readFile(join(trialDir, "test-output.txt"), "utf8")).resolves.toContain("PASS validation");
    expect(index.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ref: "hooks.jsonl", exists: true, kind: "hook_spool" }),
        expect.objectContaining({ ref: "transcript.jsonl", exists: true, kind: "transcript" }),
        expect.objectContaining({ ref: "diff.patch", exists: true, kind: "diff" }),
        expect.objectContaining({ ref: "test-output.txt", exists: true, kind: "test_output" })
      ])
    );
  });

  test("lists missing optional artifacts only in artifact-index.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-suite-artifacts-missing-"));
    const runsRoot = join(root, "runs");
    const workspaceRoot = join(root, "workspaces");

    const catalog = loadedCatalog({ withValidationCommands: false });
    const runner = new BenchmarkRunner({
      hookInstaller: new RecordingHookInstaller(),
      harnessRunner: new NoOptionalArtifactHarnessRunner(),
      hookEventCounter: new JsonlHookCounter(),
      artifactCollector: new RecordingArtifactCollector(),
      workspaceProvisioner: new DirectoryWorkspaceProvisioner()
    });
    const runId = "run_artifact_finalization_missing";
    const trialId = "artifact-integrity_codex_trial_1";
    const result = await runner.runTrial({
      benchmark: catalog.specs[0].benchmark,
      harness: "codex",
      runId,
      trialId,
      workspaceRoot
    });
    const trial = trialReport(result, trialId);

    await new FilesystemSuiteResultStore({ root: runsRoot }).save({
      runId,
      trials: [trial],
      report: suiteReport(runId, [trial]),
      processDiagnostics: result.process_diagnostics === undefined
        ? []
        : [{ spec_id: "artifact-integrity", harness: "codex", trial_id: trialId, diagnostics: result.process_diagnostics }],
      artifactFinalizations: [{
        spec_id: "artifact-integrity",
        harness: "codex",
        trial_id: trialId,
        workspace: result.workspace,
        hook_spool_path: result.artifact_paths?.hook_spool_path,
        transcript_path: result.artifact_paths?.transcript_path,
        diff_path: result.artifact_paths?.diff_path,
        test_output_path: result.artifact_paths?.test_output_path
      }]
    });

    const trialDir = join(
      runsRoot,
      "run_artifact_finalization_missing",
      "specs",
      "artifact-integrity",
      "codex",
      "artifact-integrity_codex_trial_1"
    );
    const savedResult = await readJson<{ artifact_refs: string[] }>(join(trialDir, "result.json"));
    const index = await readJson<{ artifacts: { ref: string; exists: boolean; unavailable_reason?: string }[] }>(
      join(trialDir, "artifact-index.json")
    );

    expect(savedResult.artifact_refs).not.toContain(
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/diff.patch"
    );
    expect(savedResult.artifact_refs).not.toContain(
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/test-output.txt"
    );
    expect(savedResult.artifact_refs).not.toContain(
      "specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/transcript.jsonl"
    );
    await expectExistingRefs(join(runsRoot, runId), savedResult.artifact_refs);
    expect(index.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ref: "hooks.jsonl", exists: false }),
        expect.objectContaining({ ref: "transcript.jsonl", exists: false }),
        expect.objectContaining({ ref: "diff.patch", exists: false }),
        expect.objectContaining({ ref: "test-output.txt", exists: false })
      ])
    );
  });
});

function loadedCatalog(input: { withValidationCommands: boolean }): LoadedSpecCatalog {
  return {
    catalog: {
      id: "artifact-suite",
      name: "Artifact suite",
      version: "1.0.0",
      specs: [{ id: "artifact-integrity", path: "cases/artifact-integrity/benchmark.json", tags: ["artifacts"] }],
      defaults: {
        trials: 1,
        harnesses: ["codex"],
        workspace_root: ".bmh/workspaces",
        strict_telemetry: false
      }
    },
    specs: [
      {
        id: "artifact-integrity",
        tags: ["artifacts"],
        catalogPath: "cases/artifact-integrity/benchmark.json",
        caseDirectory: ".bmh/specs/cases/artifact-integrity",
        promptMarkdown: "# Artifact integrity",
        benchmark: {
          id: "artifact-integrity",
          name: "Artifact integrity",
          version: "1.0.0",
          category: "feature",
          tags: ["artifacts"],
          repo: {
            url: "file:///repo",
            base_ref: "base",
            test_commands: input.withValidationCommands ? ["npm test"] : []
          },
          prompt: {
            text: "produce artifacts"
          },
          expected_output: {
            tests_must_pass: true
          },
          limits: {
            timeout_seconds: 30
          },
          evaluation: {
            scoring: {
              tests: 1
            }
          }
        }
      }
    ]
  };
}

function trialReport(result: RunTrialResult, trialId: string): SuiteTrialReport {
  const base = `specs/artifact-integrity/codex/${trialId}`;

  return {
    spec_id: "artifact-integrity",
    spec_version: "1.0.0",
    harness: "codex",
    trial_id: trialId,
    status: result.status,
    failure_classification: result.failure_classification,
    score: result.status === "completed" ? 1 : 0,
    tags: ["artifacts"],
    workspace: result.workspace,
    hook_event_count: result.hook_event_count,
    workspace_source: result.workspace_source,
    artifact_refs: [
      `${base}/result.json`,
      `${base}/diff.patch`,
      `${base}/test-output.txt`,
      `${base}/transcript.jsonl`
    ],
    diagnostics: result.process_diagnostics === undefined
      ? undefined
      : {
          process: {
            stdout_ref: `${base}/process-stdout.txt`,
            stderr_ref: `${base}/process-stderr.txt`,
            exit_ref: `${base}/process-exit.json`,
            exit_code: result.process_diagnostics.exit.exit_code,
            timed_out: result.process_diagnostics.exit.timed_out,
            started_at: result.process_diagnostics.exit.started_at,
            ended_at: result.process_diagnostics.exit.ended_at,
            duration_ms: result.process_diagnostics.exit.duration_ms
          }
        },
    comparability: {
      status: "comparable",
      reasons: []
    },
    metrics: [
      {
        metric: "token_usage",
        value: null,
        unit: "tokens",
        measurement_source: "unavailable",
        capture_source: "usage_capture",
        confidence: "none"
      }
    ],
    notes: []
  };
}

function suiteReport(runId: string, trials: readonly SuiteTrialReport[]): SuiteReport {
  return {
    run_id: runId,
    suite: {
      id: "artifact-suite",
      name: "Artifact suite",
      version: "1.0.0"
    },
    generated_at: "1970-01-01T00:00:00.000Z",
    selected_harnesses: ["codex"],
    spec_count: 1,
    trial_count: trials.length,
    global_summary: {
      completed: trials.filter((trial) => trial.status === "completed").length,
      failed: trials.filter((trial) => trial.status === "failed").length,
      inconclusive: 0,
      comparability_status: "comparable",
      comparability_reasons: [],
      pass_rate_by_harness: {
        codex: 1
      }
    },
    harness_summaries: [
      {
        harness: "codex",
        trials: trials.length,
        completed: trials.length,
        failed: 0,
        inconclusive: 0,
        pass_rate: 1,
        mean_score: 1,
        median_score: 1,
        min_score: 1,
        max_score: 1,
        stddev_score: 0,
        mean_duration_ms: 1000,
        total_cost_usd: null,
        mean_cost_usd: null,
        total_tokens: null,
        mean_tokens: null,
        unavailable_metrics: 1
      }
    ],
    spec_summaries: [
      {
        spec_id: "artifact-integrity",
        spec_version: "1.0.0",
        tags: ["artifacts"],
        trials: trials.length,
        completed: trials.length,
        failed: 0,
        inconclusive: 0,
        harnesses: ["codex"]
      }
    ],
    trials,
    observability: {
      token_usage: "unavailable",
      cost: "unavailable",
      context_usage: "unavailable"
    },
    comparability: {
      status: "comparable",
      reasons: []
    },
    security: {
      redaction: {
        status: "applied",
        raw_payloads_included: false
      }
    }
  };
}

class ArtifactWritingHarnessRunner implements HarnessRunnerPort {
  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    const transcriptPath = join(input.workspace, "session.jsonl");
    await mkdir(dirname(input.env.BMH_SPOOL_PATH), { recursive: true });
    await writeFile(input.env.BMH_SPOOL_PATH, "{\"event\":\"Stop\",\"transcript_path\":\"session.jsonl\"}\n", "utf8");
    await writeFile(transcriptPath, "{\"type\":\"assistant\",\"text\":\"done\"}\n", "utf8");

    return {
      exitCode: 0,
      processDiagnostics: processDiagnostics()
    };
  }
}

class NoOptionalArtifactHarnessRunner implements HarnessRunnerPort {
  public async execute(): Promise<HarnessRunnerResult> {
    return {
      exitCode: 0,
      processDiagnostics: processDiagnostics()
    };
  }
}

class TestOutputValidationRunner implements ValidationRunnerPort {
  public async execute(input: { workspace: string }): Promise<{ status: "passed"; testOutputPath: string }> {
    const testOutputPath = join(input.workspace, "validation-output.log");
    await writeFile(testOutputPath, "PASS validation\n", "utf8");
    return { status: "passed", testOutputPath };
  }
}

class DiffWritingGenerator implements DiffGeneratorPort {
  public async generate(input: { workspace: string }): Promise<{ diffPath: string }> {
    const diffPath = join(input.workspace, "generated.diff");
    await writeFile(diffPath, "diff --git a/file b/file\n", "utf8");
    return { diffPath };
  }
}

class DirectoryWorkspaceProvisioner implements WorkspaceProvisionerPort {
  public async provision(input: ProvisionWorkspaceInput): Promise<{
    workspace: string;
    spoolPath: string;
    workspaceSource?: {
      type: "git";
      repo_url: string;
      base_ref: string;
      resolved_base_sha: string;
    };
  }> {
    const workspace = join(input.workspaceRoot, input.trialId);
    await mkdir(workspace, { recursive: true });
    return {
      workspace,
      spoolPath: join(workspace, ".bmh", "hooks.jsonl"),
      workspaceSource: input.source === undefined
        ? undefined
        : {
            type: "git",
            repo_url: input.source.repoUrl,
            base_ref: input.source.baseRef,
            resolved_base_sha: input.source.baseRef
          }
    };
  }
}

class RecordingHookInstaller implements InstallHarnessHooksPort {
  public async install(input: InstallHarnessHooksInput): Promise<HookInstallation> {
    return { id: input.trialId, provider: input.harness, workspace: input.workspace, files: [] };
  }

  public async uninstall(): Promise<void> {}
}

class JsonlHookCounter {
  public async count(input: { spoolPath: string }): Promise<number> {
    try {
      return (await readFile(input.spoolPath, "utf8")).trim().split("\n").filter(Boolean).length;
    } catch {
      return 0;
    }
  }
}

class RecordingArtifactCollector implements ArtifactCollectorPort {
  public async collect(_input: ArtifactCollectorInput): Promise<[]> {
    return [];
  }
}

function processDiagnostics(): ProcessDiagnostics {
  return {
    stdout: "stdout\n",
    stderr: "stderr\n",
    exit: {
      executable: "fake-harness",
      args: ["run"],
      exit_code: 0,
      timed_out: false,
      started_at: "2026-06-21T00:00:00.000Z",
      ended_at: "2026-06-21T00:00:01.000Z",
      duration_ms: 1000
    }
  };
}

async function expectExistingRefs(root: string, refs: readonly string[]): Promise<void> {
  for (const ref of refs) {
    const metadata = await stat(join(root, ref));
    expect(metadata.isFile()).toBe(true);
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
