import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SuiteResultStore } from "../../../application/ports/suite-result-store.js";
import type { SuiteReport, SuiteTrialReport } from "../../../domain/reports/suite-report.js";
import { buildSuiteReport, renderSuiteReportHtml } from "../../../domain/reports/suite-report.js";

export class FilesystemSuiteResultStore implements SuiteResultStore {
  public constructor(private readonly options: { root: string }) {}

  public async save(input: {
    runId: string;
    trials: readonly SuiteTrialReport[];
    report: SuiteReport;
  }): Promise<void> {
    const runDir = this.runDir(input.runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(this.resultsPath(input.runId), `${JSON.stringify(input.report, null, 2)}\n`, "utf8");
    await writeFile(join(runDir, "report.html"), renderSuiteReportHtml(input.report), "utf8");

    for (const trial of input.trials) {
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
    return join(this.runDir(runId), "specs", trial.spec_id, trial.harness, storageTrialId(trial), "result.json");
  }

  private runDir(runId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
      throw new Error("invalid run id for suite result storage");
    }

    return join(this.options.root, runId);
  }
}

function storageTrialId(trial: SuiteTrialReport): string {
  const prefix = `${trial.spec_id}_${trial.harness}_`;
  return trial.trial_id.startsWith(prefix) ? trial.trial_id.slice(prefix.length) : trial.trial_id;
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
      metrics?: unknown;
      artifacts?: string[];
      artifact_refs?: string[];
      comparability?: { status: "comparable" | "limited" | "not_comparable"; reasons?: string[] };
      notes?: string[];
      tags?: string[];
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
      tags: trial.tags ?? spec?.tags ?? [],
      artifact_refs: trial.artifact_refs ?? trial.artifacts ?? [],
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
