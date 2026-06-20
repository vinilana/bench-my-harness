export type ComparisonStatus = "comparable" | "limited" | "not_comparable";
export type MeasurementSource = "native" | "observed" | "derived" | "estimated" | "unavailable";

export interface ComparisonMetric {
  readonly metric: string;
  readonly measurement_source: MeasurementSource;
}

export interface ComparableRun {
  readonly run_id: string;
  readonly benchmark_version: string;
  readonly model_policy: string;
  readonly permission_profile: string;
  readonly initial_repo_state?: string;
  readonly network_policy?: string;
  readonly test_suite?: string;
  readonly harness_version?: string;
  readonly adapter_capabilities?: readonly string[];
  readonly metrics: readonly ComparisonMetric[];
}

export interface CompareRunsInput {
  readonly baseline: ComparableRun;
  readonly candidate: ComparableRun;
}

export interface ComparisonDecision {
  readonly status: ComparisonStatus;
  readonly reasons: readonly string[];
}

const LIMITED_SOURCES: readonly MeasurementSource[] = [
  "estimated",
  "derived",
  "unavailable"
];

export function compareRuns(input: CompareRunsInput): ComparisonDecision {
  const notComparableReasons = setupMismatchReasons(input.baseline, input.candidate);

  if (notComparableReasons.length > 0) {
    return { status: "not_comparable", reasons: notComparableReasons };
  }

  const limitedReasons = metricSourceReasons(input.baseline, input.candidate);

  return {
    status: limitedReasons.length > 0 ? "limited" : "comparable",
    reasons: limitedReasons
  };
}

function setupMismatchReasons(
  baseline: ComparableRun,
  candidate: ComparableRun
): string[] {
  const checks: readonly [keyof ComparableRun, string][] = [
    ["benchmark_version", "benchmark_version_mismatch"],
    ["model_policy", "model_policy_mismatch"],
    ["permission_profile", "permission_profile_mismatch"],
    ["initial_repo_state", "initial_repo_state_mismatch"],
    ["network_policy", "network_policy_mismatch"],
    ["test_suite", "test_suite_mismatch"]
  ];

  return checks.flatMap(([field, reason]) =>
    baseline[field] !== candidate[field] ? [reason] : []
  );
}

function metricSourceReasons(
  baseline: ComparableRun,
  candidate: ComparableRun
): string[] {
  const reasons: string[] = [];
  const candidateByMetric = new Map(
    candidate.metrics.map((metric) => [metric.metric, metric])
  );

  for (const baselineMetric of baseline.metrics) {
    const candidateMetric = candidateByMetric.get(baselineMetric.metric);
    if (!candidateMetric) {
      continue;
    }

    if (baselineMetric.measurement_source !== candidateMetric.measurement_source) {
      reasons.push(`metric_source_mismatch:${baselineMetric.metric}`);
      continue;
    }

    if (LIMITED_SOURCES.includes(baselineMetric.measurement_source)) {
      reasons.push(`metric_source_limited:${baselineMetric.metric}`);
    }
  }

  return reasons;
}
