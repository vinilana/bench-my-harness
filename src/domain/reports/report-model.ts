import type { ComparisonStatus } from "../comparison/compare-runs.js";
import type { HarnessProvider } from "../events/normalized-event.js";
import type { EvaluationStatistics } from "../evaluation/score.js";
import type { MetricObservation } from "../metrics/metric-observation.js";

export type ReportFormat = "json" | "markdown";
export type RedactionStatus = "applied" | "not_needed" | "pending";

export interface BenchmarkReport {
  readonly run_id: string;
  readonly benchmark: {
    readonly id: string;
    readonly version: string;
  };
  readonly provider: HarnessProvider;
  readonly generated_at: string;
  readonly metrics: readonly MetricObservation[];
  readonly evaluation: {
    readonly score_total: number;
    readonly statistics: EvaluationStatistics;
  };
  readonly comparability: {
    readonly status: ComparisonStatus;
    readonly reasons: readonly string[];
  };
  readonly effective_observability: Record<string, string>;
  readonly adapter_capabilities: readonly string[];
  readonly security: {
    readonly redaction: {
      readonly status: RedactionStatus;
      readonly raw_payloads_included: boolean;
    };
  };
  readonly notes?: readonly string[];
  readonly raw_payloads?: readonly unknown[];
}
