import { redactSecrets } from "../security/redact-secrets.js";

export type SuiteTrialStatus = "completed" | "failed" | "inconclusive";
export type SuiteComparabilityStatus = "comparable" | "limited" | "not_comparable";

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
  readonly artifact_refs: readonly string[];
  readonly comparability: {
    readonly status: SuiteComparabilityStatus;
    readonly reasons: readonly string[];
  };
  readonly metrics: readonly {
    readonly metric: string;
    readonly value?: number | null;
    readonly unit?: string;
    readonly measurement_source: string;
    readonly capture_source: string;
    readonly confidence: string;
  }[];
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
  readonly total_tokens: number | null;
  readonly mean_tokens: number | null;
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
      readonly status: "applied";
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
    ...new Set(input.trials.flatMap((trial) => trial.comparability.reasons))
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
        status: "applied",
        raw_payloads_included: false
      }
    }
  };
}

export function renderSuiteReportHtml(report: SuiteReport): string {
  const sanitized = redactUnknown(report) as SuiteReport;
  const trialRows = sanitized.trials.map((trial) => {
    const metricSource = trial.metrics.some((metric) => metric.measurement_source === "unavailable")
      ? "unavailable"
      : "available";
    return `<tr data-harness="${escapeHtml(trial.harness)}" data-spec="${escapeHtml(trial.spec_id)}" data-tags="${escapeHtml(trial.tags.join(" "))}" data-status="${escapeHtml(trial.status)}" data-comparability="${escapeHtml(trial.comparability.status)}">
<td>${escapeHtml(trial.spec_id)}</td>
<td>${escapeHtml(trial.harness)}</td>
<td>${escapeHtml(trial.trial_id)}</td>
<td>${escapeHtml(trial.status)}</td>
<td>${escapeHtml(String(trial.score))}</td>
<td>${escapeHtml(trial.comparability.status)}</td>
<td>${escapeHtml(metricSource)}</td>
<td>${escapeHtml(trial.artifact_refs.join(", "))}</td>
</tr>`;
  }).join("\n");
  const harnessRows = sanitized.harness_summaries.map((summary) => `<tr>
<td>${escapeHtml(summary.harness)}</td>
<td>${summary.trials}</td>
<td>${summary.completed}</td>
<td>${summary.failed}</td>
<td>${summary.pass_rate.toFixed(2)}</td>
<td>${summary.mean_score.toFixed(2)}</td>
<td>${escapeHtml(summary.mean_duration_ms === null ? "unavailable" : String(summary.mean_duration_ms))}</td>
<td>${escapeHtml(summary.total_cost_usd === null ? "unavailable" : String(summary.total_cost_usd))}</td>
<td>${escapeHtml(summary.total_tokens === null ? "unavailable" : String(summary.total_tokens))}</td>
<td>${summary.unavailable_metrics}</td>
</tr>`).join("\n");
  const specRows = sanitized.spec_summaries.map((summary) => `<tr>
<td>${escapeHtml(summary.spec_id)}</td>
<td>${escapeHtml(summary.spec_version)}</td>
<td>${escapeHtml(summary.tags.join(", "))}</td>
<td>${summary.trials}</td>
<td>${summary.completed}</td>
<td>${summary.failed}</td>
<td>${summary.inconclusive}</td>
</tr>`).join("\n");
  const comparabilityReasons = sanitized.comparability.reasons.length === 0
    ? "none"
    : sanitized.comparability.reasons.join(", ");
  const passRates = Object.entries(sanitized.global_summary.pass_rate_by_harness)
    .map(([harness, passRate]) => `${harness}: ${passRate.toFixed(2)}`)
    .join(", ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bench My Harness Report ${escapeHtml(sanitized.run_id)}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 24px; color: #1f2933; background: #f7f8fa; }
main { max-width: 1180px; margin: 0 auto; }
section { margin: 24px 0; }
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { padding: 10px 12px; border-bottom: 1px solid #d9dee7; text-align: left; }
th { background: #eef2f6; }
.filters { display: flex; gap: 12px; flex-wrap: wrap; }
label { display: grid; gap: 4px; font-size: 13px; }
input, select { padding: 8px; border: 1px solid #b8c0cc; border-radius: 6px; min-width: 180px; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.metric { background: #fff; padding: 14px; border: 1px solid #d9dee7; border-radius: 8px; }
</style>
</head>
<body>
<main>
<h1>Bench My Harness Report</h1>
<p>Run ${escapeHtml(sanitized.run_id)} · Suite ${escapeHtml(sanitized.suite.id)}@${escapeHtml(sanitized.suite.version)} · Generated ${escapeHtml(sanitized.generated_at)}</p>
<p>Redaction: ${escapeHtml(sanitized.security.redaction.status)}</p>
<section class="summary" aria-label="Global benchmark summary">
<h2>Global Benchmark Summary</h2>
<div class="metric"><strong>Specs</strong><br>${sanitized.spec_count}</div>
<div class="metric"><strong>Trials</strong><br>${sanitized.trial_count}</div>
<div class="metric"><strong>Completed</strong><br>${sanitized.global_summary.completed}</div>
<div class="metric"><strong>Failed</strong><br>${sanitized.global_summary.failed}</div>
<div class="metric"><strong>Comparability</strong><br>${escapeHtml(sanitized.global_summary.comparability_status)}</div>
<div class="metric"><strong>Pass rate by harness</strong><br>${escapeHtml(passRates)}</div>
</section>
<p>${escapeHtml(comparabilityReasons)}</p>
<section>
<h2>Harness Summary</h2>
<table>
<thead><tr><th>Harness</th><th>Trials</th><th>Completed</th><th>Failed</th><th>Pass Rate</th><th>Mean Score</th><th>Mean Duration</th><th>Total Cost</th><th>Total Tokens</th><th>Unavailable Metrics</th></tr></thead>
<tbody>${harnessRows}</tbody>
</table>
</section>
<section>
<h2>Per-Spec Summary</h2>
<table>
<thead><tr><th>Spec</th><th>Version</th><th>Tags</th><th>Trials</th><th>Completed</th><th>Failed</th><th>Inconclusive</th></tr></thead>
<tbody>${specRows}</tbody>
</table>
</section>
<section>
<h2>Trial Details</h2>
<div class="filters">
<label>Harness <select id="filter-harness"><option value="">All</option>${sanitized.selected_harnesses.map((harness) => `<option value="${escapeHtml(harness)}">${escapeHtml(harness)}</option>`).join("")}</select></label>
<label>Spec <input id="filter-spec" type="search" placeholder="Spec id"></label>
<label>Tag <input id="filter-tag" type="search" placeholder="Tag"></label>
<label>Status <select id="filter-status"><option value="">All</option><option value="completed">completed</option><option value="failed">failed</option><option value="inconclusive">inconclusive</option></select></label>
<label>Comparability <select id="filter-comparability"><option value="">All</option><option value="comparable">comparable</option><option value="limited">limited</option><option value="not_comparable">not_comparable</option></select></label>
</div>
<table>
<thead><tr><th>Spec</th><th>Harness</th><th>Trial</th><th>Status</th><th>Score</th><th>Comparability</th><th>Metric Data</th><th>Artifacts</th></tr></thead>
<tbody id="trial-rows">${trialRows}</tbody>
</table>
</section>
</main>
<script>
const filters = ["harness", "spec", "tag", "status", "comparability"];
for (const name of filters) document.getElementById("filter-" + name).addEventListener("input", applyFilters);
function applyFilters() {
  const values = Object.fromEntries(filters.map((name) => [name, document.getElementById("filter-" + name).value.toLowerCase()]));
  for (const row of document.querySelectorAll("#trial-rows tr")) {
    const visible = (!values.harness || row.dataset.harness === values.harness)
      && (!values.spec || row.dataset.spec.includes(values.spec))
      && (!values.tag || row.dataset.tags.includes(values.tag))
      && (!values.status || row.dataset.status === values.status)
      && (!values.comparability || row.dataset.comparability === values.comparability);
    row.hidden = !visible;
  }
}
</script>
</body>
</html>
`;
}

function summarizeHarness(harness: "codex" | "claude_code", trials: readonly SuiteTrialReport[]): HarnessSuiteSummary {
  const scores = trials.map((trial) => trial.score);
  const completed = trials.filter((trial) => trial.status === "completed").length;
  const durations = trials.flatMap((trial) => trial.duration_ms === undefined ? [] : [trial.duration_ms]);
  const costs = metricValues(trials, "cost");
  const tokens = [
    ...metricValues(trials, "input_tokens"),
    ...metricValues(trials, "output_tokens"),
    ...metricValues(trials, "tokens"),
    ...metricValues(trials, "token_usage")
  ];
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
    total_cost_usd: nullableSum(costs),
    mean_cost_usd: nullableMean(costs),
    total_tokens: nullableSum(tokens),
    mean_tokens: nullableMean(tokens),
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
  const metrics = trials.flatMap((trial) => trial.metrics);

  if (metrics.length === 0) {
    return {
      token_usage: "unavailable",
      cost: "unavailable",
      context_usage: "unavailable"
    };
  }

  return Object.fromEntries(metrics.map((metric) => [metric.metric, metric.measurement_source]));
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

function metricValues(trials: readonly SuiteTrialReport[], metricName: string): number[] {
  return trials.flatMap((trial) =>
    trial.metrics
      .filter((metric) => metric.metric === metricName && typeof metric.value === "number")
      .map((metric) => metric.value as number)
  );
}

function nullableMean(values: readonly number[]): number | null {
  return values.length === 0 ? null : mean(values);
}

function nullableSum(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSecrets(value).redacted;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nested]) =>
        key === "raw_payloads" || nested === undefined ? [] : [[key, redactUnknown(nested)]]
      )
    );
  }

  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
