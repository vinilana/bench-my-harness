import type { HarnessName } from "../ports/harness-runner-port.js";
import type {
  TrialArtifactFinalizationRecord,
  TrialProcessDiagnosticsRecord,
  SuiteResultStore
} from "../ports/suite-result-store.js";
import type { MetricObservation, UsageReport } from "../ports/usage-capture-port.js";
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
  readonly onProgress?: (message: string) => void;
}

export class RunSpecSuiteUseCase {
  public constructor(private readonly resultStore?: SuiteResultStore) {}

  public async execute(input: RunSpecSuiteInput): Promise<SuiteReport> {
    const selectedSpecs = this.selectSpecs(input.loadedCatalog, input.specIds, input.tags);
    const harnesses = input.harnesses ?? input.loadedCatalog.catalog.defaults?.harnesses ?? ["codex", "claude_code"];
    const trials = input.trials ?? input.loadedCatalog.catalog.defaults?.trials ?? 1;
    const workspaceRoot = input.workspaceRoot ?? input.loadedCatalog.catalog.defaults?.workspace_root ?? ".bmh/workspaces";
    const trialReports: SuiteTrialReport[] = [];
    const processDiagnostics: TrialProcessDiagnosticsRecord[] = [];
    const artifactFinalizations: TrialArtifactFinalizationRecord[] = [];
    const totalTrials = selectedSpecs.length * harnesses.length * trials;
    let completedTrials = 0;

    if (!Number.isInteger(trials) || trials <= 0) {
      throw new Error(`suite trials must be a positive integer: ${trials}`);
    }

    for (const spec of selectedSpecs) {
      for (const harness of harnesses) {
        for (let trialNumber = 1; trialNumber <= trials; trialNumber += 1) {
          const trialId = `${spec.id}_${harness}_trial_${trialNumber}`;
          input.onProgress?.(`starting trial ${completedTrials + 1}/${totalTrials}: ${spec.id} ${harness}\n`);
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

          const comparability = comparabilityFor(result);
          const diagnosticsRefs = result.process_diagnostics === undefined
            ? undefined
            : processDiagnosticsRefs(spec.id, harness, trialId, result.process_diagnostics);
          const processDiagnosticRefs = diagnosticsRefs?.process;
          const baseArtifactRef = `specs/${spec.id}/${harness}/${trialId}`;
          const diagnosticArtifactRefs = processDiagnosticRefs === undefined
            ? []
            : [
                processDiagnosticRefs.stdout_ref,
                processDiagnosticRefs.stderr_ref,
                processDiagnosticRefs.exit_ref
              ];
          const provisionalArtifactRefs = [
            `${baseArtifactRef}/diff.patch`,
            `${baseArtifactRef}/test-output.txt`,
            `${baseArtifactRef}/transcript.jsonl`
          ];

          if (result.process_diagnostics !== undefined) {
            processDiagnostics.push({
              spec_id: spec.id,
              harness,
              trial_id: trialId,
              diagnostics: result.process_diagnostics
            });
          }
          artifactFinalizations.push({
            spec_id: spec.id,
            harness,
            trial_id: trialId,
            workspace: result.workspace,
            hook_spool_path: result.artifact_paths?.hook_spool_path,
            transcript_path: result.artifact_paths?.transcript_path,
            diff_path: result.artifact_paths?.diff_path,
            test_output_path: result.artifact_paths?.test_output_path,
            process_diagnostics: result.process_diagnostics,
            usage: result.usage,
            strict_telemetry: input.strictTelemetry ?? input.loadedCatalog.catalog.defaults?.strict_telemetry
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
            hook_event_count: result.hook_event_count,
            hook_command: result.hook_command,
            workspace_source: result.workspace_source,
            artifact_refs: [
              `${baseArtifactRef}/result.json`,
              ...diagnosticArtifactRefs,
              ...provisionalArtifactRefs
            ],
            diagnostics: diagnosticsRefs,
            comparability,
            metrics: metricsForUsage(result.usage),
            usage: result.usage,
            notes: []
          });
          completedTrials += 1;
          input.onProgress?.(
            `trial completed: ${spec.id} ${harness} ${result.status} duration=${result.process_diagnostics?.exit.duration_ms ?? 0} hooks=${result.hook_event_count ?? 0}\n`
          );
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
      report,
      processDiagnostics,
      artifactFinalizations
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

function processDiagnosticsRefs(
  specId: string,
  harness: HarnessName,
  trialId: string,
  diagnostics: NonNullable<Awaited<ReturnType<BenchmarkRunner["runTrial"]>>["process_diagnostics"]>
): NonNullable<SuiteTrialReport["diagnostics"]> {
  const base = `specs/${specId}/${harness}/${trialId}`;

  return {
    process: {
      stdout_ref: `${base}/process-stdout.txt`,
      stderr_ref: `${base}/process-stderr.txt`,
      exit_ref: `${base}/process-exit.json`,
      exit_code: diagnostics.exit.exit_code,
      timed_out: diagnostics.exit.timed_out,
      started_at: diagnostics.exit.started_at,
      ended_at: diagnostics.exit.ended_at,
      duration_ms: diagnostics.exit.duration_ms
    }
  };
}

function comparabilityFor(result: Awaited<ReturnType<BenchmarkRunner["runTrial"]>>): SuiteTrialReport["comparability"] {
  if (result.status !== "completed") {
    return {
      status: "limited",
      reasons: ["trial did not complete successfully"]
    };
  }

  if (result.workspace_source?.type === "git" && result.workspace_source.resolved_base_sha !== undefined) {
    return { status: "comparable", reasons: [] };
  }

  return {
    status: "limited",
    reasons: ["workspace source provenance is unavailable"]
  };
}

function metricsForUsage(usage: UsageReport | undefined): SuiteTrialReport["metrics"] {
  if (usage === undefined) {
    return [
      unavailableMetric("token_usage", "tokens", "provider did not expose total token usage"),
      unavailableMetric("context_usage", undefined, "context usage capture is not configured"),
      unavailableMetric("cost", "usd", "no native billing or pricing source configured")
    ];
  }

  const tokenMetric: MetricObservation = usage.tokens.total === null
    ? unavailableMetric("token_usage", "tokens", "provider did not expose total token usage")
    : {
        metric: "token_usage",
        value: usage.tokens.total.value,
        unit: usage.tokens.total.unit,
        measurement_source: usage.tokens.total.measurement_source,
        capture_source: usage.tokens.total.capture_source,
        confidence: usage.tokens.total.confidence,
        unavailable_reason: usage.tokens.total.unavailable_reason,
        evidence_refs: usage.tokens.total.evidence_refs
      };

  return [
    tokenMetric,
    unavailableMetric("context_usage", undefined, "context usage capture is not configured"),
    {
      metric: "cost",
      value: usage.cost.total_usd.value,
      unit: usage.cost.total_usd.unit,
      measurement_source: usage.cost.total_usd.measurement_source,
      capture_source: usage.cost.total_usd.capture_source,
      confidence: usage.cost.total_usd.confidence,
      unavailable_reason: usage.cost.total_usd.unavailable_reason,
      evidence_refs: usage.cost.total_usd.evidence_refs
    }
  ];
}

function unavailableMetric(metric: string, unit: string | undefined, unavailableReason: string): MetricObservation {
  return {
    metric,
    value: null,
    unit,
    measurement_source: "unavailable",
    capture_source: "usage_capture",
    confidence: "none",
    unavailable_reason: unavailableReason
  };
}
