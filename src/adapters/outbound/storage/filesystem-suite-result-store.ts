import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { FilesystemArtifactFinalizer } from "../filesystem/filesystem-artifact-finalizer.js";
import type { ArtifactFinalizerPort } from "../../../application/ports/artifact-finalizer-port.js";
import type {
  SuiteResultStore,
  TrialArtifactFinalizationRecord,
  TrialProcessDiagnosticsRecord
} from "../../../application/ports/suite-result-store.js";
import type { SuiteReport, SuiteTrialReport } from "../../../domain/reports/suite-report.js";
import { buildSuiteReport, renderSuiteReportHtml } from "../../../domain/reports/suite-report.js";

export class FilesystemSuiteResultStore implements SuiteResultStore {
  private readonly artifactFinalizer: ArtifactFinalizerPort;

  public constructor(private readonly options: { root: string; artifactFinalizer?: ArtifactFinalizerPort }) {
    this.artifactFinalizer = options.artifactFinalizer ?? new FilesystemArtifactFinalizer({ root: options.root });
  }

  public async save(input: {
    runId: string;
    trials: readonly SuiteTrialReport[];
    report: SuiteReport;
    processDiagnostics?: readonly TrialProcessDiagnosticsRecord[];
    artifactFinalizations?: readonly TrialArtifactFinalizationRecord[];
  }): Promise<void> {
    const runDir = this.runDir(input.runId);
    await mkdir(runDir, { recursive: true });

    for (const diagnostic of input.processDiagnostics ?? []) {
      await this.writeProcessDiagnostics(input.runId, diagnostic);
    }

    const finalizedTrials = await this.finalizeTrials(
      input.runId,
      input.trials,
      input.artifactFinalizations ?? [],
      input.processDiagnostics ?? []
    );
    const finalizedReport: SuiteReport = {
      ...input.report,
      trials: finalizedTrials
    };

    await writeFile(this.resultsPath(input.runId), `${JSON.stringify(finalizedReport, null, 2)}\n`, "utf8");
    await writeFile(join(runDir, "report.html"), renderSuiteReportHtml(finalizedReport), "utf8");

    for (const trial of finalizedTrials) {
      const trialPath = this.trialPath(input.runId, trial);
      await mkdir(dirname(trialPath), { recursive: true });
      await writeFile(trialPath, `${JSON.stringify(trial, null, 2)}\n`, "utf8");
    }
  }

  public async findByRunId(runId: string): Promise<SuiteReport | undefined> {
    try {
      return normalizeStoredSuiteReport(JSON.parse(await readFile(this.resultsPath(runId), "utf8")) as unknown);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }

      throw new Error(`stored suite result could not be loaded for run ${runId}`);
    }
  }

  private resultsPath(runId: string): string {
    return join(this.runDir(runId), "results.json");
  }

  private trialPath(runId: string, trial: SuiteTrialReport): string {
    return join(this.runDir(runId), "specs", trial.spec_id, trial.harness, trial.trial_id, "result.json");
  }

  private async writeProcessDiagnostics(
    runId: string,
    record: TrialProcessDiagnosticsRecord
  ): Promise<void> {
    const trialDir = join(this.runDir(runId), "specs", record.spec_id, record.harness, record.trial_id);

    await mkdir(trialDir, { recursive: true });
    await writeFile(join(trialDir, "process-stdout.txt"), record.diagnostics.stdout, "utf8");
    await writeFile(join(trialDir, "process-stderr.txt"), record.diagnostics.stderr, "utf8");
    await writeFile(
      join(trialDir, "process-exit.json"),
      `${JSON.stringify(record.diagnostics.exit, null, 2)}\n`,
      "utf8"
    );
  }

  private async finalizeTrials(
    runId: string,
    trials: readonly SuiteTrialReport[],
    finalizations: readonly TrialArtifactFinalizationRecord[],
    processDiagnostics: readonly TrialProcessDiagnosticsRecord[]
  ): Promise<SuiteTrialReport[]> {
    const finalizationByTrial = new Map(
      finalizations.map((record) => [trialKey(record.spec_id, record.harness, record.trial_id), record])
    );
    const diagnosticsByTrial = new Map(
      processDiagnostics.map((record) => [trialKey(record.spec_id, record.harness, record.trial_id), record.diagnostics])
    );
    const finalized: SuiteTrialReport[] = [];

    for (const trial of trials) {
      const finalization = finalizationByTrial.get(trialKey(trial.spec_id, trial.harness, trial.trial_id));

      if (finalization === undefined) {
        finalized.push(trial);
        continue;
      }

      const result = await this.artifactFinalizer.finalize({
        runId,
        specId: finalization.spec_id,
        harness: finalization.harness,
        trialId: finalization.trial_id,
        workspace: finalization.workspace,
        hookSpoolPath: finalization.hook_spool_path,
        transcriptPath: finalization.transcript_path,
        diffPath: finalization.diff_path,
        testOutputPath: finalization.test_output_path,
        processDiagnostics: finalization.process_diagnostics
          ?? diagnosticsByTrial.get(trialKey(finalization.spec_id, finalization.harness, finalization.trial_id)),
        usage: finalization.usage,
        strictTelemetry: finalization.strict_telemetry
      });

      finalized.push({
        ...trial,
        artifact_refs: [
          join("specs", trial.spec_id, trial.harness, trial.trial_id, "result.json"),
          ...result.artifactRefs
        ],
        artifact_integrity: {
          artifacts: result.artifactIndex
        }
      });
    }

    return finalized;
  }

  private runDir(runId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
      throw new Error("invalid run id for suite result storage");
    }

    return join(this.options.root, runId);
  }
}

function trialKey(specId: string, harness: string, trialId: string): string {
  return `${specId}\0${harness}\0${trialId}`;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function normalizeStoredSuiteReport(value: unknown): SuiteReport {
  if (value !== null && typeof value === "object" && !Array.isArray(value) && "report" in value) {
    return (value as { report: SuiteReport }).report;
  }

  const record = value as {
    run_id: string;
    suite: SuiteReport["suite"];
    generated_at?: string;
    selected_harnesses?: ("codex" | "claude_code")[];
    specs?: { id: string; version: string; tags?: string[] }[];
    trials?: unknown[];
    security?: SuiteReport["security"];
  };

  if (isSuiteReportRecord(value)) {
    return value;
  }

  const specs = record.specs ?? [];
  const trials: SuiteTrialReport[] = (record.trials ?? []).map((trialValue) => {
    const trial = trialValue as {
      spec_id: string;
      spec_version?: string;
      harness: "codex" | "claude_code";
      trial_id: string;
      status: "completed" | "failed" | "inconclusive";
      failure_classification?: string;
      score?: number;
      duration_ms?: number;
      hook_event_count?: number;
      hook_command?: SuiteTrialReport["hook_command"];
      metrics?: unknown;
      artifacts?: string[];
      artifact_refs?: string[];
      diagnostics?: SuiteTrialReport["diagnostics"];
      comparability?: { status: "comparable" | "limited" | "not_comparable"; reasons?: string[] };
      notes?: string[];
      tags?: string[];
      workspace_source?: SuiteTrialReport["workspace_source"];
    };
    const spec = specs.find((entry) => entry.id === trial.spec_id);

    return {
      spec_id: trial.spec_id,
      spec_version: trial.spec_version ?? spec?.version ?? "1.0.0",
      harness: trial.harness,
      trial_id: trial.trial_id,
      status: trial.status,
      failure_classification: trial.failure_classification,
      score: trial.score ?? 0,
      duration_ms: trial.duration_ms,
      hook_event_count: trial.hook_event_count,
      hook_command: trial.hook_command,
      tags: trial.tags ?? spec?.tags ?? [],
      workspace_source: trial.workspace_source,
      artifact_refs: trial.artifact_refs ?? trial.artifacts ?? [],
      diagnostics: trial.diagnostics,
      comparability: {
        status: trial.comparability?.status ?? "limited",
        reasons: trial.comparability?.reasons ?? []
      },
      metrics: normalizeMetrics(trial.metrics),
      notes: trial.notes ?? []
    };
  });

  return buildSuiteReport({
    runId: record.run_id,
    suite: record.suite,
    selectedHarnesses: record.selected_harnesses ?? [...new Set(trials.map((trial) => trial.harness))],
    trials,
    generatedAt: record.generated_at
  });
}

function isSuiteReportRecord(value: unknown): value is SuiteReport {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "run_id" in value &&
    "global_summary" in value &&
    "harness_summaries" in value &&
    "spec_summaries" in value;
}

function normalizeMetrics(metrics: unknown): SuiteTrialReport["metrics"] {
  if (Array.isArray(metrics)) {
    return metrics as SuiteTrialReport["metrics"];
  }

  if (metrics !== null && typeof metrics === "object") {
    return Object.entries(metrics as Record<string, {
      status?: string;
      measurement_source?: string;
      capture_source?: string;
      confidence?: string;
    }>).map(([metric, value]) => ({
      metric,
      measurement_source: value.status === "unavailable" ? "unavailable" : value.measurement_source ?? "unavailable",
      capture_source: value.capture_source ?? "unknown",
      confidence: value.confidence ?? "unknown"
    }));
  }

  return [];
}
