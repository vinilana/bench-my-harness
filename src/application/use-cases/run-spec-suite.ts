import type { HarnessName } from "../ports/harness-runner-port.js";
import type { SuiteResultStore } from "../ports/suite-result-store.js";
import type { LoadedSpecCatalog } from "../../domain/benchmark/spec-catalog.js";
import type { SuiteReport, SuiteTrialReport } from "../../domain/reports/suite-report.js";
import { buildSuiteReport } from "../../domain/reports/suite-report.js";
import type { BenchmarkRunner } from "./run-benchmark.js";

export interface RunSpecSuiteInput {
  readonly loadedCatalog: LoadedSpecCatalog;
  readonly runner: BenchmarkRunner;
  readonly runId: string;
  readonly harnesses?: readonly HarnessName[];
  readonly specIds?: readonly string[];
  readonly tags?: readonly string[];
  readonly trials?: number;
  readonly workspaceRoot?: string;
  readonly catalogRoot: string;
  readonly strictTelemetry?: boolean;
}

export class RunSpecSuiteUseCase {
  public constructor(private readonly resultStore?: SuiteResultStore) {}

  public async execute(input: RunSpecSuiteInput): Promise<SuiteReport> {
    const selectedSpecs = this.selectSpecs(input.loadedCatalog, input.specIds, input.tags);
    const harnesses = input.harnesses ?? input.loadedCatalog.catalog.defaults?.harnesses ?? ["codex", "claude_code"];
    const trials = input.trials ?? input.loadedCatalog.catalog.defaults?.trials ?? 1;
    const workspaceRoot = input.workspaceRoot ?? input.loadedCatalog.catalog.defaults?.workspace_root ?? ".bmh/workspaces";
    const trialReports: SuiteTrialReport[] = [];

    if (!Number.isInteger(trials) || trials <= 0) {
      throw new Error(`suite trials must be a positive integer: ${trials}`);
    }

    for (const spec of selectedSpecs) {
      for (const harness of harnesses) {
        for (let trialNumber = 1; trialNumber <= trials; trialNumber += 1) {
          const trialId = `${spec.id}_${harness}_trial_${trialNumber}`;
          const result = await input.runner.runTrial({
            benchmark: spec.benchmark,
            harness,
            runId: input.runId,
            trialId,
            workspaceRoot,
            benchmarkRoot: spec.featureDirectory,
            promptRoot: spec.featureDirectory,
            strictTelemetry: input.strictTelemetry ?? input.loadedCatalog.catalog.defaults?.strict_telemetry
          });

          trialReports.push({
            spec_id: spec.id,
            spec_version: spec.benchmark.version,
            harness,
            trial_id: trialId,
            status: result.status,
            failure_classification: result.failure_classification,
            score: result.status === "completed" ? 1 : 0,
            tags: spec.tags,
            workspace: result.workspace,
            artifact_refs: [
              `specs/${spec.id}/${harness}/trial_${trialNumber}/result.json`,
              `specs/${spec.id}/${harness}/trial_${trialNumber}/diff.patch`,
              `specs/${spec.id}/${harness}/trial_${trialNumber}/test-output.txt`,
              `specs/${spec.id}/${harness}/trial_${trialNumber}/transcript.jsonl`
            ],
            comparability: {
              status: "limited" as const,
              reasons: ["token, cost, and context metrics may be unavailable without native usage capture"]
            },
            metrics: [
              {
                metric: "token_usage",
                value: null,
                unit: "tokens",
                measurement_source: "unavailable",
                capture_source: "usage_capture",
                confidence: "none"
              },
              {
                metric: "context_usage",
                value: null,
                measurement_source: "unavailable",
                capture_source: "usage_capture",
                confidence: "none"
              },
              {
                metric: "cost",
                value: null,
                unit: "usd",
                measurement_source: "unavailable",
                capture_source: "usage_capture",
                confidence: "none"
              }
            ],
            notes: []
          });
        }
      }
    }

    const report = buildSuiteReport({
      runId: input.runId,
      suite: {
        id: input.loadedCatalog.catalog.id,
        name: input.loadedCatalog.catalog.name,
        version: input.loadedCatalog.catalog.version
      },
      selectedHarnesses: harnesses,
      trials: trialReports
    });

    await this.resultStore?.save({
      runId: input.runId,
      trials: trialReports,
      report
    });

    return report;
  }

  private selectSpecs(
    catalog: LoadedSpecCatalog,
    specIds: readonly string[] | undefined,
    tags: readonly string[] | undefined
  ): LoadedSpecCatalog["specs"] {
    const specIdSet = specIds && specIds.length > 0 ? new Set(specIds) : undefined;
    const tagSet = tags && tags.length > 0 ? new Set(tags) : undefined;

    return catalog.specs.filter((spec) => {
      const matchesId = specIdSet === undefined || specIdSet.has(spec.id);
      const matchesTag = tagSet === undefined || spec.tags.some((tag) => tagSet.has(tag));
      return matchesId && matchesTag;
    });
  }
}
