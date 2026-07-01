
export type SuiteTrialStatus = "completed" | "failed" | "inconclusive";
export type SuiteComparabilityStatus = "comparable" | "limited" | "not_comparable";

export interface SuiteMetricObservation {
  readonly metric: string;
  readonly value?: number | null;
  readonly unit?: string;
  readonly measurement_source: string;
  readonly capture_source: string;
  readonly confidence: string;
  readonly unavailable_reason?: string;
  readonly evidence_refs?: readonly string[];
}

export interface SuiteUsageScalarObservation {
  readonly value?: number | null;
  readonly unit?: string;
  readonly measurement_source: string;
  readonly capture_source: string;
  readonly confidence: string;
  readonly unavailable_reason?: string;
  readonly evidence_refs?: readonly string[];
}

export interface SuiteUsageReport {
  readonly llms?: readonly {
    readonly model: string;
    readonly provider?: string;
    readonly role?: string;
    readonly measurement_source: string;
    readonly capture_source: string;
    readonly confidence: string;
    readonly evidence_refs?: readonly string[];
  }[];
  readonly tokens?: {
    readonly total?: SuiteUsageScalarObservation | null;
    readonly input?: SuiteUsageScalarObservation | null;
    readonly output?: SuiteUsageScalarObservation | null;
    readonly cache_read?: SuiteUsageScalarObservation | null;
    readonly cache_write?: SuiteUsageScalarObservation | null;
  };
  readonly cost?: {
    readonly total_usd?: SuiteUsageScalarObservation | null;
  };
  readonly subagents?: readonly {
    readonly id: string;
    readonly name?: string;
    readonly llms?: readonly {
      readonly model: string;
      readonly provider?: string;
      readonly role?: string;
      readonly measurement_source: string;
      readonly capture_source: string;
      readonly confidence: string;
      readonly evidence_refs?: readonly string[];
    }[];
    readonly tokens?: {
      readonly total?: SuiteUsageScalarObservation | null;
    };
    readonly cost?: {
      readonly total_usd?: SuiteUsageScalarObservation | null;
    };
    readonly evidence_refs?: readonly string[];
  }[];
  readonly skills?: readonly {
    readonly name: string;
    readonly source?: string;
    readonly invocation?: string;
    readonly measurement_source: string;
    readonly capture_source: string;
    readonly confidence: string;
    readonly evidence_refs?: readonly string[];
  }[];
  readonly mcps?: readonly {
    readonly server: string;
    readonly tool?: string;
    readonly call_count?: number;
    readonly measurement_source: string;
    readonly capture_source: string;
    readonly confidence: string;
    readonly evidence_refs?: readonly string[];
  }[];
  readonly coverage?: Readonly<Record<string, string>>;
}

export interface SuiteArtifactIndex {
  readonly artifacts: readonly {
    readonly ref: string;
    readonly exists: boolean;
    readonly bytes?: number;
    readonly sha256?: string;
    readonly kind?: string;
    readonly unavailable_reason?: string;
  }[];
}

export interface SuiteAdapterCapabilityMatrix {
  readonly provider: "codex" | "claude_code";
  readonly adapter_version: string;
  readonly supported_provider_versions: readonly string[];
  readonly capabilities: Readonly<Record<string, string | boolean>>;
  readonly capability_evidence: Readonly<Record<string, readonly string[]>>;
  readonly known_gaps?: readonly string[];
}

export interface SuiteTrialReport {
  readonly spec_id: string;
  readonly spec_version: string;
  readonly harness: "codex" | "claude_code";
  readonly trial_id: string;
  readonly status: SuiteTrialStatus;
  readonly failure_classification?: string;
  readonly score: number;
  readonly duration_ms?: number;
  readonly tags: readonly string[];
  readonly workspace?: string;
  readonly hook_event_count?: number;
  readonly hook_command?: {
    readonly strategy: "workspace_shim";
    readonly command: string;
    readonly shimPath?: string;
  };
  readonly workspace_source?: {
    readonly type: "git";
    readonly repo_url: string;
    readonly base_ref: string;
    readonly resolved_base_sha?: string;
    readonly golden_ref?: string;
    readonly resolved_golden_sha?: string;
  };
  readonly artifact_refs: readonly string[];
  readonly diagnostics?: {
    readonly process: {
      readonly stdout_ref: string;
      readonly stderr_ref: string;
      readonly exit_ref: string;
      readonly exit_code: number;
      readonly timed_out: boolean;
      readonly started_at: string;
      readonly ended_at: string;
      readonly duration_ms: number;
    };
  };
  readonly comparability: {
    readonly status: SuiteComparabilityStatus;
    readonly reasons: readonly string[];
  };
  readonly metrics: readonly SuiteMetricObservation[];
  readonly usage?: SuiteUsageReport;
  readonly adapter_capabilities?: SuiteAdapterCapabilityMatrix;
  readonly artifact_integrity?: SuiteArtifactIndex;
  readonly notes: readonly string[];
}

export interface HarnessSuiteSummary {
  readonly harness: "codex" | "claude_code";
  readonly trials: number;
  readonly completed: number;
  readonly failed: number;
  readonly inconclusive: number;
  readonly pass_rate: number;
  readonly mean_score: number;
  readonly median_score: number;
  readonly min_score: number;
  readonly max_score: number;
  readonly stddev_score: number;
  readonly mean_duration_ms: number | null;
  readonly total_cost_usd: number | null;
  readonly mean_cost_usd: number | null;
  readonly cost_per_1m_tokens: number | null;
  readonly cost_per_1m_tokens_metric: SuiteMetricObservation | null;
  readonly total_tokens: number | null;
  readonly mean_tokens: number | null;
  readonly total_input_tokens: number | null;
  readonly mean_input_tokens: number | null;
  readonly total_output_tokens: number | null;
  readonly mean_output_tokens: number | null;
  readonly total_cache_read_tokens: number | null;
  readonly total_cache_write_tokens: number | null;
  readonly total_interactions: number | null;
  readonly mean_interactions: number | null;
  readonly total_tool_calls: number | null;
  readonly total_tool_failures: number | null;
  readonly unavailable_metrics: number;
}

export interface SpecSuiteSummary {
  readonly spec_id: string;
  readonly spec_version: string;
  readonly tags: readonly string[];
  readonly trials: number;
  readonly completed: number;
  readonly failed: number;
  readonly inconclusive: number;
  readonly harnesses: readonly ("codex" | "claude_code")[];
}

export interface SuiteReport {
  readonly run_id: string;
  readonly suite: {
    readonly id: string;
    readonly version: string;
    readonly name: string;
  };
  readonly generated_at: string;
  readonly selected_harnesses: readonly ("codex" | "claude_code")[];
  readonly spec_count: number;
  readonly trial_count: number;
  readonly global_summary: {
    readonly completed: number;
    readonly failed: number;
    readonly inconclusive: number;
    readonly comparability_status: SuiteComparabilityStatus;
    readonly comparability_reasons: readonly string[];
    readonly pass_rate_by_harness: Readonly<Record<string, number>>;
  };
  readonly harness_summaries: readonly HarnessSuiteSummary[];
  readonly spec_summaries: readonly SpecSuiteSummary[];
  readonly trials: readonly SuiteTrialReport[];
  readonly observability: Readonly<Record<string, string>>;
  readonly comparability: {
    readonly status: SuiteComparabilityStatus;
    readonly reasons: readonly string[];
  };
  readonly security: {
    readonly redaction: {
      readonly status: "pending" | "applied" | "not_needed";
      readonly raw_payloads_included: false;
    };
  };
}

export function buildSuiteReport(input: {
  readonly runId: string;
  readonly suite: SuiteReport["suite"];
  readonly selectedHarnesses: readonly ("codex" | "claude_code")[];
  readonly trials: readonly SuiteTrialReport[];
  readonly generatedAt?: string;
}): SuiteReport {
  const harnessSummaries = input.selectedHarnesses.map((harness) =>
    summarizeHarness(harness, input.trials.filter((trial) => trial.harness === harness))
  );
  const completed = input.trials.filter((trial) => trial.status === "completed").length;
  const failed = input.trials.filter((trial) => trial.status === "failed").length;
  const inconclusive = input.trials.filter((trial) =>
    trial.status === "inconclusive" || trial.comparability.status !== "comparable"
  ).length;
  const comparabilityReasons = [
    ...new Set([
      ...input.trials.flatMap((trial) => trial.comparability.reasons),
      ...metricComparabilityReasons(input.trials, input.selectedHarnesses),
      ...modelComparabilityReasons(input.trials, input.selectedHarnesses),
      ...adapterCapabilityComparabilityReasons(input.trials, input.selectedHarnesses)
    ])
  ];
  const comparabilityStatus = comparabilityReasons.length > 0 ? "limited" : "comparable";

  return {
    run_id: input.runId,
    suite: input.suite,
    generated_at: input.generatedAt ?? "1970-01-01T00:00:00.000Z",
    selected_harnesses: input.selectedHarnesses,
    spec_count: new Set(input.trials.map((trial) => trial.spec_id)).size,
    trial_count: input.trials.length,
    global_summary: {
      completed,
      failed,
      inconclusive,
      comparability_status: comparabilityStatus,
      comparability_reasons: comparabilityReasons,
      pass_rate_by_harness: Object.fromEntries(
        harnessSummaries.map((summary) => [summary.harness, summary.pass_rate])
      )
    },
    harness_summaries: harnessSummaries,
    spec_summaries: summarizeSpecs(input.trials),
    trials: input.trials,
    observability: observabilitySummary(input.trials),
    comparability: {
      status: comparabilityStatus,
      reasons: comparabilityReasons
    },
    security: {
      redaction: {
        status: "pending",
        raw_payloads_included: false
      }
    }
  };
}

const tokenMetricNames = ["token_usage", "total_tokens", "tokens"] as const;
const inputTokenMetricNames = ["input_tokens"] as const;
const outputTokenMetricNames = ["output_tokens"] as const;
const cacheReadTokenMetricNames = ["cache_read_tokens"] as const;
const cacheWriteTokenMetricNames = ["cache_write_tokens"] as const;
const costMetricNames = ["cost", "total_cost_usd"] as const;
const interactionMetricNames = ["agent_interactions_total"] as const;
const toolCallMetricNames = ["tool_calls_total"] as const;
const toolFailureMetricNames = ["tool_calls_failed"] as const;

function summarizeHarness(harness: "codex" | "claude_code", trials: readonly SuiteTrialReport[]): HarnessSuiteSummary {
  const scores = trials.map((trial) => trial.score);
  const completed = trials.filter((trial) => trial.status === "completed").length;
  const durations = trials.flatMap((trial) => {
    const duration = trial.duration_ms ?? trial.diagnostics?.process.duration_ms;
    return duration === undefined ? [] : [duration];
  });
  const costs = compatibleMetricAggregate(trials, costMetricNames);
  const tokens = compatibleMetricAggregate(trials, tokenMetricNames);
  const inputTokens = compatibleMetricAggregate(trials, inputTokenMetricNames);
  const outputTokens = compatibleMetricAggregate(trials, outputTokenMetricNames);
  const cacheReadTokens = compatibleMetricAggregate(trials, cacheReadTokenMetricNames);
  const cacheWriteTokens = compatibleMetricAggregate(trials, cacheWriteTokenMetricNames);
  const interactions = compatibleMetricAggregate(trials, interactionMetricNames);
  const toolCalls = compatibleMetricAggregate(trials, toolCallMetricNames);
  const toolFailures = compatibleMetricAggregate(trials, toolFailureMetricNames);
  const costPer1mTokens = costPer1mTokensMetric(costs, tokens);
  const unavailableMetrics = trials.reduce(
    (count, trial) => count + trial.metrics.filter((metric) => metric.measurement_source === "unavailable").length,
    0
  );

  return {
    harness,
    trials: trials.length,
    completed,
    failed: trials.filter((trial) => trial.status === "failed").length,
    inconclusive: trials.filter((trial) => trial.comparability.status !== "comparable").length,
    pass_rate: trials.length === 0 ? 0 : completed / trials.length,
    mean_score: mean(scores),
    median_score: median(scores),
    min_score: scores.length === 0 ? 0 : Math.min(...scores),
    max_score: scores.length === 0 ? 0 : Math.max(...scores),
    stddev_score: stddev(scores),
    mean_duration_ms: nullableMean(durations),
    total_cost_usd: costs.total,
    mean_cost_usd: costs.mean,
    cost_per_1m_tokens: costPer1mTokens?.value ?? null,
    cost_per_1m_tokens_metric: costPer1mTokens,
    total_tokens: tokens.total,
    mean_tokens: tokens.mean,
    total_input_tokens: inputTokens.total,
    mean_input_tokens: inputTokens.mean,
    total_output_tokens: outputTokens.total,
    mean_output_tokens: outputTokens.mean,
    total_cache_read_tokens: cacheReadTokens.total,
    total_cache_write_tokens: cacheWriteTokens.total,
    total_interactions: interactions.total,
    mean_interactions: interactions.mean,
    total_tool_calls: toolCalls.total,
    total_tool_failures: toolFailures.total,
    unavailable_metrics: unavailableMetrics
  };
}

function summarizeSpecs(trials: readonly SuiteTrialReport[]): SpecSuiteSummary[] {
  return [...new Set(trials.map((trial) => trial.spec_id))].map((specId) => {
    const specTrials = trials.filter((trial) => trial.spec_id === specId);
    const first = specTrials[0];

    return {
      spec_id: specId,
      spec_version: first?.spec_version ?? "",
      tags: first?.tags ?? [],
      trials: specTrials.length,
      completed: specTrials.filter((trial) => trial.status === "completed").length,
      failed: specTrials.filter((trial) => trial.status === "failed").length,
      inconclusive: specTrials.filter((trial) => trial.status === "inconclusive").length,
      harnesses: [...new Set(specTrials.map((trial) => trial.harness))]
    };
  });
}

function observabilitySummary(trials: readonly SuiteTrialReport[]): Record<string, string> {
  return {
    token_usage: metricAvailability(trials, tokenMetricNames),
    input_tokens: metricAvailability(trials, inputTokenMetricNames),
    output_tokens: metricAvailability(trials, outputTokenMetricNames),
    cache_read_tokens: metricAvailability(trials, cacheReadTokenMetricNames),
    cache_write_tokens: metricAvailability(trials, cacheWriteTokenMetricNames),
    cost: metricAvailability(trials, costMetricNames),
    context_usage: metricAvailability(trials, ["context_usage", "context"]),
    interactions: metricAvailability(trials, interactionMetricNames),
    tool_calls: metricAvailability(trials, toolCallMetricNames),
    tool_failures: metricAvailability(trials, toolFailureMetricNames)
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function stddev(values: readonly number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function nullableMean(values: readonly number[]): number | null {
  return values.length === 0 ? null : mean(values);
}

function compatibleMetricAggregate(
  trials: readonly SuiteTrialReport[],
  metricNames: readonly string[]
): {
  readonly total: number | null;
  readonly mean: number | null;
  readonly sources: readonly string[];
  readonly metrics: readonly SuiteMetricObservation[];
} {
  const metrics = matchingMetrics(trials, metricNames);
  const values = metrics.filter((metric) => typeof metric.value === "number");
  const sources = [...new Set(values.map(metricProvenanceKey))];

  if (values.length === 0 || sources.length !== 1) {
    return { total: null, mean: null, sources, metrics: values };
  }

  const numericValues = values.map((metric) => metric.value as number);
  return {
    total: numericValues.reduce((sum, value) => sum + value, 0),
    mean: mean(numericValues),
    sources,
    metrics: values
  };
}

function costPer1mTokensMetric(
  costs: ReturnType<typeof compatibleMetricAggregate>,
  tokens: ReturnType<typeof compatibleMetricAggregate>
): SuiteMetricObservation | null {
  if (costs.total === null || tokens.total === null || tokens.total === 0) {
    return null;
  }

  return {
    metric: "cost_per_1m_tokens",
    value: (costs.total / tokens.total) * 1_000_000,
    unit: "usd_per_1m_tokens",
    measurement_source: "derived",
    capture_source: "suite_summary_ratio",
    confidence: lowestConfidence([...costs.metrics, ...tokens.metrics]),
    evidence_refs: uniqueStrings([
      ...costs.metrics.flatMap((metric) => metric.evidence_refs ?? []),
      ...tokens.metrics.flatMap((metric) => metric.evidence_refs ?? [])
    ])
  };
}

function lowestConfidence(metrics: readonly SuiteMetricObservation[]): string {
  const order = ["none", "low", "medium", "high"];
  const values = metrics.map((metric) => metric.confidence);
  const lowest = values.reduce((current, value) =>
    order.indexOf(value) < order.indexOf(current) ? value : current,
    "high"
  );

  return lowest;
}

function uniqueStrings(values: readonly string[]): string[] | undefined {
  const unique = [...new Set(values)];
  return unique.length === 0 ? undefined : unique;
}

function matchingMetrics(
  trials: readonly SuiteTrialReport[],
  metricNames: readonly string[]
): SuiteMetricObservation[] {
  return trials.flatMap((trial) => trial.metrics.filter((metric) => metricNames.includes(metric.metric)));
}

function metricAvailability(trials: readonly SuiteTrialReport[], metricNames: readonly string[]): string {
  const metrics = matchingMetrics(trials, metricNames);
  const available = metrics.filter((metric) => typeof metric.value === "number" && metric.measurement_source !== "unavailable");
  const unavailable = metrics.filter((metric) => metric.measurement_source === "unavailable");
  const sources = new Set(available.map(metricProvenanceKey));

  if (available.length === 0) {
    return "unavailable";
  }
  if (unavailable.length > 0 || sources.size > 1) {
    return "limited";
  }

  return available[0]?.measurement_source ?? "unavailable";
}

function metricComparabilityReasons(
  trials: readonly SuiteTrialReport[],
  harnesses: readonly ("codex" | "claude_code")[]
): string[] {
  return [
    ...metricDimensionComparabilityReasons("token_usage", tokenMetricNames, trials, harnesses),
    ...metricDimensionComparabilityReasons("input_tokens", inputTokenMetricNames, trials, harnesses),
    ...metricDimensionComparabilityReasons("output_tokens", outputTokenMetricNames, trials, harnesses),
    ...metricDimensionComparabilityReasons("cache_read_tokens", cacheReadTokenMetricNames, trials, harnesses),
    ...metricDimensionComparabilityReasons("cache_write_tokens", cacheWriteTokenMetricNames, trials, harnesses),
    ...metricDimensionComparabilityReasons("cost", costMetricNames, trials, harnesses)
  ];
}

function modelComparabilityReasons(
  trials: readonly SuiteTrialReport[],
  harnesses: readonly ("codex" | "claude_code")[]
): string[] {
  const primaryModels = harnesses.flatMap((harness) => {
    const models = uniqueStrings(trials
      .filter((trial) => trial.harness === harness)
      .flatMap((trial) => trial.usage?.llms ?? [])
      .filter((llm) => llm.role === undefined || llm.role === "primary")
      .map((llm) => llm.model));

    return models === undefined ? [] : models.map((model) => ({ harness, model }));
  });
  const uniqueModels = uniqueStrings(primaryModels.map((entry) => entry.model)) ?? [];

  if (uniqueModels.length <= 1) {
    return [];
  }

  return [`model_mismatch:${uniqueModels.join(":")}`];
}

function adapterCapabilityComparabilityReasons(
  trials: readonly SuiteTrialReport[],
  harnesses: readonly ("codex" | "claude_code")[]
): string[] {
  const capabilityValues = new Map<string, Set<string>>();
  const reasons: string[] = [];

  for (const harness of harnesses) {
    const harnessTrials = trials.filter((trial) => trial.harness === harness);
    const matrices = harnessTrials
      .flatMap((trial) => trial.adapter_capabilities === undefined ? [] : [trial.adapter_capabilities]);

    if (harnessTrials.length > 0 && matrices.length !== harnessTrials.length) {
      reasons.push(`adapter_capabilities_unavailable:${harness}`);
    }

    const capabilityNames = uniqueStrings(matrices.flatMap((matrix) => Object.keys(matrix.capabilities))) ?? [];

    for (const capability of capabilityNames) {
      const values = new Set(matrices.map((matrix) => String(matrix.capabilities[capability])));
      if (values.size === 0) {
        continue;
      }

      const existing = capabilityValues.get(capability) ?? new Set<string>();
      for (const value of values) {
        existing.add(value);
      }
      capabilityValues.set(capability, existing);
    }
  }

  const mismatches = [...capabilityValues.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([capability]) => `adapter_capability_mismatch:${capability}`);

  return [
    ...reasons,
    ...mismatches
  ];
}

function metricDimensionComparabilityReasons(
  dimension: string,
  metricNames: readonly string[],
  trials: readonly SuiteTrialReport[],
  harnesses: readonly ("codex" | "claude_code")[]
): string[] {
  const reasons: string[] = [];
  const sourceByHarness = new Map<string, string>();
  const availableByHarness = new Map<string, boolean>();
  let hasAvailable = false;
  let hasUnavailable = false;

  for (const harness of harnesses) {
    const harnessTrials = trials.filter((trial) => trial.harness === harness);
    const metrics = matchingMetrics(harnessTrials, metricNames);
    const available = metrics.filter((metric) => typeof metric.value === "number" && metric.measurement_source !== "unavailable");
    const unavailable = metrics.some((metric) => metric.measurement_source === "unavailable");
    const sources = [...new Set(available.map(metricProvenanceKey))];

    hasAvailable = hasAvailable || available.length > 0;
    hasUnavailable = hasUnavailable || unavailable || metrics.length === 0;
    availableByHarness.set(harness, available.length > 0);

    if (sources.length > 1) {
      reasons.push(`metric_source_mismatch:${dimension}:${harness}`);
    } else if (sources.length === 1) {
      sourceByHarness.set(harness, sources[0]);
    }
  }

  if (hasAvailable) {
    for (const [harness, available] of availableByHarness.entries()) {
      if (!available) {
        reasons.push(`metric_unavailable:${dimension}:${harness}`);
      }
    }
  }

  if (!hasAvailable && hasUnavailable && harnesses.length > 1) {
    reasons.push(`metric_unavailable:${dimension}`);
  }

  if (new Set(sourceByHarness.values()).size > 1) {
    reasons.push(`metric_source_mismatch:${dimension}`);
  }

  return [...new Set(reasons)];
}

function metricProvenanceKey(metric: SuiteMetricObservation): string {
  return [
    metric.measurement_source,
    metric.capture_source,
    metric.confidence,
    metric.unit ?? ""
  ].join(":");
}
