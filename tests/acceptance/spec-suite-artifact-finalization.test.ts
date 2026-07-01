import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

import { FilesystemSuiteResultStore } from "../../src/adapters/outbound/storage/filesystem-suite-result-store.js";
import { FilesystemArtifactFinalizer } from "../../src/adapters/outbound/filesystem/filesystem-artifact-finalizer.js";
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
import type { RunTrialResult } from "../../src/application/ports/benchmark-trial-runner-port.js";
import type { LoadedSpecCatalog } from "../../src/domain/benchmark/spec-catalog.js";
import type { SuiteReport, SuiteTrialReport } from "../../src/domain/reports/suite-report.js";
import type { UsageReport } from "../../src/application/ports/usage-capture-port.js";

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

  test("redacts secrets from reportable finalized artifacts and records redaction metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-suite-artifacts-redaction-"));
    const runsRoot = join(root, "runs");
    const workspace = join(root, "workspace");
    const hookSpoolPath = join(workspace, ".bmh", "hooks.jsonl");
    const diffPath = join(workspace, "generated.diff");
    const testOutputPath = join(workspace, "validation-output.log");

    await mkdir(dirname(hookSpoolPath), { recursive: true });
    await writeFile(hookSpoolPath, "{\"event\":\"PreToolUse\",\"authorization\":\"Bearer secret-token\"}\n", "utf8");
    await writeFile(diffPath, "diff --git a/.env b/.env\n+OPENAI_API_KEY=sk-test-1234567890\n", "utf8");
    await writeFile(testOutputPath, "FAIL Authorization: Bearer secret-token\n", "utf8");

    const result = await new FilesystemArtifactFinalizer({ root: runsRoot }).finalize({
      runId: "run_artifact_redaction",
      specId: "artifact-integrity",
      harness: "codex",
      trialId: "artifact-integrity_codex_trial_1",
      workspace,
      hookSpoolPath,
      diffPath,
      testOutputPath,
      processDiagnostics: {
        stdout: "OPENAI_API_KEY=sk-test-1234567890\n",
        stderr: "Authorization: Bearer secret-token\n",
        exit: {
          ...processDiagnostics().exit,
          args: ["--api-key=sk-test-1234567890"]
        }
      },
      usage: usageReportWithSecret()
    });

    const trialDir = join(
      runsRoot,
      "run_artifact_redaction",
      "specs",
      "artifact-integrity",
      "codex",
      "artifact-integrity_codex_trial_1"
    );
    const reportableArtifacts = [
      "process-stdout.txt",
      "process-stderr.txt",
      "process-exit.json",
      "hooks.jsonl",
      "diff.patch",
      "test-output.txt",
      "usage.json"
    ];

    for (const artifact of reportableArtifacts) {
      const contents = await readFile(join(trialDir, artifact), "utf8");
      expect(contents).toContain("[REDACTED]");
      expect(contents).not.toContain("sk-test-1234567890");
      expect(contents).not.toContain("secret-token");
    }

    expect(result.artifactIndex).toEqual(expect.arrayContaining(
      reportableArtifacts.map((ref) => expect.objectContaining({
        ref,
        exists: true,
        redaction: expect.objectContaining({
          status: "applied",
          raw_payloads_included: false,
          original_payload_hash: expect.stringMatching(/^sha256:/),
          redaction_hashes: expect.arrayContaining([expect.stringMatching(/^sha256:/)])
        })
      }))
    ));
  });

  test("finalizes Claude status-line and OTel evidence artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-suite-telemetry-artifacts-"));
    const runsRoot = join(root, "runs");
    const workspace = join(root, "workspace");
    const statusLinePath = join(workspace, ".bmh", "status-line.jsonl");
    const otelPath = join(workspace, ".bmh", "otel.jsonl");
    await mkdir(dirname(statusLinePath), { recursive: true });
    await writeFile(statusLinePath, "{\"model\":\"claude-sonnet-4-6\"}\n", "utf8");
    await writeFile(otelPath, "{\"name\":\"claude_code.token.usage\",\"value\":1,\"attributes\":{\"type\":\"input\"}}\n", "utf8");

    const result = await new FilesystemArtifactFinalizer({ root: runsRoot }).finalize({
      runId: "run_telemetry_artifacts",
      specId: "artifact-integrity",
      harness: "claude_code",
      trialId: "artifact-integrity_claude_trial_1",
      workspace,
      statusLineJsonlPath: statusLinePath,
      otelJsonlPath: otelPath
    });

    const trialDir = join(
      runsRoot,
      "run_telemetry_artifacts",
      "specs",
      "artifact-integrity",
      "claude_code",
      "artifact-integrity_claude_trial_1"
    );

    expect(result.artifactRefs).toEqual(expect.arrayContaining([
      "specs/artifact-integrity/claude_code/artifact-integrity_claude_trial_1/status-line.jsonl",
      "specs/artifact-integrity/claude_code/artifact-integrity_claude_trial_1/otel.jsonl"
    ]));
    await expect(readFile(join(trialDir, "status-line.jsonl"), "utf8")).resolves.toContain("claude-sonnet-4-6");
    await expect(readFile(join(trialDir, "otel.jsonl"), "utf8")).resolves.toContain("claude_code.token.usage");
    expect(result.artifactIndex).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: "status-line.jsonl", exists: true, kind: "status_line" }),
      expect.objectContaining({ ref: "otel.jsonl", exists: true, kind: "otel_telemetry" })
    ]));
  });

  test("redacts secrets from stored suite and trial JSON reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-suite-json-redaction-"));
    const runsRoot = join(root, "runs");
    const runId = "run_json_redaction";
    const trial = trialReportWithSecrets();
    const store = new FilesystemSuiteResultStore({ root: runsRoot });

    await store.save({
      runId,
      trials: [trial],
      report: suiteReport(runId, [trial]),
      processDiagnostics: [{
        spec_id: trial.spec_id,
        harness: trial.harness,
        trial_id: trial.trial_id,
        diagnostics: {
          stdout: "OPENAI_API_KEY=sk-test-1234567890\n",
          stderr: "Authorization: Bearer secret-token\n",
          exit: {
            ...processDiagnostics().exit,
            args: ["--api-key=sk-test-1234567890"]
          }
        }
      }]
    });

    const resultsJson = await readFile(join(runsRoot, runId, "results.json"), "utf8");
    const trialDir = join(runsRoot, runId, "specs", "artifact-integrity", "codex", trial.trial_id);
    const trialJson = await readFile(
      join(trialDir, "result.json"),
      "utf8"
    );
    const found = await store.findByRunId(runId);
    const processStdout = await readFile(join(trialDir, "process-stdout.txt"), "utf8");
    const processStderr = await readFile(join(trialDir, "process-stderr.txt"), "utf8");
    const processExit = await readFile(join(trialDir, "process-exit.json"), "utf8");

    for (const contents of [resultsJson, trialJson, JSON.stringify(found), processStdout, processStderr, processExit]) {
      expect(contents).toContain("[REDACTED]");
      expect(contents).not.toContain("sk-test-1234567890");
      expect(contents).not.toContain("secret-token");
      expect(contents).not.toContain("repo-password");
    }
    expect(found?.security.redaction.status).toBe("applied");
    expect(found?.security.redaction.raw_payloads_included).toBe(false);
  });

  test("rejects traversal IDs before writing suite result artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-suite-path-traversal-"));
    const runsRoot = join(root, "runs");
    const runId = "run_path_traversal";
    const trial: SuiteTrialReport = {
      ...trialReportWithSecrets(),
      spec_id: "../escaped-spec",
      trial_id: "trial_1"
    };
    const store = new FilesystemSuiteResultStore({ root: runsRoot });

    await expect(store.save({
      runId,
      trials: [trial],
      report: suiteReport(runId, [trial]),
      processDiagnostics: [{
        spec_id: trial.spec_id,
        harness: trial.harness,
        trial_id: trial.trial_id,
        diagnostics: processDiagnostics()
      }]
    })).rejects.toThrow("invalid path segment");

    await expect(stat(join(runsRoot, runId, "escaped-spec"))).rejects.toThrow();
  });

  test("rejects traversal IDs before finalizing trial artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-finalizer-path-traversal-"));
    const runsRoot = join(root, "runs");

    await expect(new FilesystemArtifactFinalizer({ root: runsRoot }).finalize({
      runId: "run_finalizer_path_traversal",
      specId: "../escaped-spec",
      harness: "codex",
      trialId: "trial_1",
      processDiagnostics: processDiagnostics()
    })).rejects.toThrow("invalid path segment");

    await expect(stat(join(runsRoot, "run_finalizer_path_traversal", "escaped-spec"))).rejects.toThrow();
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
        cost_per_1m_tokens: null,
        cost_per_1m_tokens_metric: null,
        total_tokens: null,
        mean_tokens: null,
        total_input_tokens: null,
        mean_input_tokens: null,
        total_output_tokens: null,
        mean_output_tokens: null,
        total_cache_read_tokens: null,
        total_cache_write_tokens: null,
        total_interactions: null,
        mean_interactions: null,
        total_tool_calls: null,
        total_tool_failures: null,
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

function trialReportWithSecrets(): SuiteTrialReport {
  return {
    spec_id: "artifact-integrity",
    spec_version: "1.0.0",
    harness: "codex",
    trial_id: "artifact-integrity_codex_trial_1",
    status: "completed",
    score: 1,
    tags: ["artifacts"],
    workspace_source: {
      type: "git",
      repo_url: "https://alice:repo-password@example.com/org/repo.git",
      base_ref: "main",
      resolved_base_sha: "abc123"
    },
    artifact_refs: ["specs/artifact-integrity/codex/artifact-integrity_codex_trial_1/result.json"],
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
        confidence: "none",
        unavailable_reason: "OPENAI_API_KEY=sk-test-1234567890"
      }
    ],
    usage: usageReportWithSecret(),
    notes: ["Authorization: Bearer secret-token"]
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

function usageReportWithSecret(): UsageReport {
  return {
    llms: [{
      model: "gpt-5.5",
      provider: "openai",
      role: "primary",
      measurement_source: "native",
      capture_source: "test_fixture",
      confidence: "high",
      evidence_refs: ["process-stdout.txt"]
    }],
    tokens: {
      total: {
        value: null,
        unit: "tokens",
        measurement_source: "unavailable",
        capture_source: "usage_capture",
        confidence: "none",
        unavailable_reason: "OPENAI_API_KEY=sk-test-1234567890"
      },
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
        capture_source: "usage_capture",
        confidence: "none",
        unavailable_reason: "Authorization: Bearer secret-token"
      }
    },
    subagents: [],
    skills: [],
    mcps: [],
    coverage: {
      model: "available",
      tokens: "unavailable",
      cost: "unavailable",
      subagents: "unavailable",
      skills: "unavailable",
      mcp: "unavailable"
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
