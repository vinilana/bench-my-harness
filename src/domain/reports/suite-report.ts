import { redactSecrets } from "../security/redact-secrets.js";
import { renderStatusPill, reportStyles } from "./report-theme.js";

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
    ...new Set([
      ...input.trials.flatMap((trial) => trial.comparability.reasons),
      ...metricComparabilityReasons(input.trials, input.selectedHarnesses)
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
        status: "applied",
        raw_payloads_included: false
      }
    }
  };
}

export function renderSuiteReportHtml(report: SuiteReport): string {
  const sanitized = redactUnknown(report) as SuiteReport;
  const rankingRows = rankingEntries(sanitized).map((entry) => `<tr data-harness="${escapeHtml(entry.summary.harness)}" data-rank="${entry.overallRank}" data-cost-rank="${entry.costRank}" data-token-rank="${entry.tokenRank}">
<td>${entry.overallRank}</td>
<td>${escapeHtml(entry.summary.harness)}</td>
<td>${entry.summary.trials}</td>
<td>${entry.summary.completed}</td>
<td>${entry.summary.mean_score.toFixed(2)}</td>
<td>${formatNullable(entry.summary.mean_duration_ms, " ms")}</td>
<td>${formatNullable(entry.summary.total_cost_usd, " USD")} ${renderSummaryMetricBadge(sanitized, entry.summary.harness, ["cost", "total_cost_usd"])}</td>
<td>${formatNullable(entry.summary.total_tokens, " tokens")} ${renderSummaryMetricBadge(sanitized, entry.summary.harness, tokenMetricNames)}</td>
<td>${formatEfficiency(entry.summary.total_tokens, entry.summary.completed, " tokens")}</td>
<td>${formatEfficiency(entry.summary.total_cost_usd, entry.summary.completed, " USD")}</td>
</tr>`).join("\n");
  const trialRows = sanitized.trials.map((trial) => {
    const metricSource = trial.metrics.some((metric) => metric.measurement_source === "unavailable")
      ? "unavailable"
      : "available";
    return `<tr data-harness="${escapeHtml(trial.harness)}" data-spec="${escapeHtml(trial.spec_id)}" data-tags="${escapeHtml(trial.tags.join(" "))}" data-status="${escapeHtml(trial.status)}" data-comparability="${escapeHtml(trial.comparability.status)}">
<td>${escapeHtml(trial.spec_id)}</td>
<td>${escapeHtml(trial.harness)}</td>
<td>${escapeHtml(trial.trial_id)}</td>
<td>${renderStatusPill(trial.status)}</td>
<td>${escapeHtml(String(trial.score))}</td>
<td>${renderStatusPill(trial.comparability.status)}</td>
<td>${escapeHtml(metricSource)} ${trial.metrics.map(renderMetricBadge).join(" ")}</td>
<td>${trial.artifact_refs.map(renderArtifactLink).join(", ")}</td>
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
  const rankingStatus = rankingDimensionStatus(sanitized);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bench My Harness Report ${escapeHtml(sanitized.run_id)}</title>
<style>${reportStyles()}</style>
</head>
<body>
<header class="app-header"><div class="app-header__inner">
<h1>${escapeHtml(sanitized.suite.name)}</h1>
<div class="chips">
<span class="chip">Run <b>${escapeHtml(sanitized.run_id)}</b></span>
<span class="chip">Suite <b>${escapeHtml(sanitized.suite.id)}@${escapeHtml(sanitized.suite.version)}</b></span>
<span class="chip">Generated <b>${escapeHtml(sanitized.generated_at)}</b></span>
<span class="chip">Redaction: ${escapeHtml(sanitized.security.redaction.status)}</span>
<span class="chip">Comparability ${renderStatusPill(sanitized.global_summary.comparability_status)}</span>
</div>
</div></header>
<main>
<section class="summary-section" aria-label="Global benchmark summary">
<h2>Global Benchmark Summary</h2>
<div class="summary">
<div class="metric"><span class="metric__label">Specs</span><span class="metric__value">${sanitized.spec_count}</span></div>
<div class="metric"><span class="metric__label">Trials</span><span class="metric__value">${sanitized.trial_count}</span></div>
<div class="metric"><span class="metric__label">Completed</span><span class="metric__value">${sanitized.global_summary.completed}</span></div>
<div class="metric"><span class="metric__label">Failed</span><span class="metric__value">${sanitized.global_summary.failed}</span></div>
<div class="metric"><span class="metric__label">Comparability</span><span class="metric__value" style="font-size:18px">${escapeHtml(sanitized.global_summary.comparability_status)}</span></div>
<div class="metric"><span class="metric__label">Pass rate by harness</span><span class="metric__value" style="font-size:15px;font-weight:600">${escapeHtml(passRates)}</span></div>
</div>
<p class="section-note">Comparability reasons: ${escapeHtml(comparabilityReasons)}</p>
</section>
<section>
<h2>Harness Ranking</h2>
<div class="filters">
<label>Ranking dimension <select id="ranking-dimension" data-ranking-status="${escapeHtml(rankingStatus)}">
<option value="overall">overall score</option>
<option value="duration">duration</option>
<option value="cost">total cost</option>
<option value="tokens">total tokens</option>
<option value="tokens_per_completed_trial">tokens per completed trial</option>
<option value="cost_per_completed_trial">cost per completed trial</option>
<option value="cost_per_score_point">cost per score point</option>
</select></label>
</div>
<p><strong>Best harness for selected ranking:</strong> <span id="best-harness">${escapeHtml(rankingEntries(sanitized)[0]?.summary.harness ?? "unavailable")}</span>. Cost and token rankings with missing data are ${escapeHtml(rankingStatus)}.</p>
<table>
<thead><tr><th>Rank</th><th>Harness</th><th>Trials</th><th>Completed</th><th>Mean Score</th><th>Mean Duration</th><th>Total Cost</th><th>Total Tokens</th><th>Tokens / Completed</th><th>Cost / Completed</th></tr></thead>
<tbody id="ranking-rows">${rankingRows}</tbody>
</table>
</section>
<section>
<h2>Visual Summaries</h2>
<div class="charts">
${renderBarChart("Duration by harness", sanitized.harness_summaries.map((summary) => ({ label: summary.harness, value: summary.mean_duration_ms })), "ms")}
${renderBarChart("Score by harness", sanitized.harness_summaries.map((summary) => ({ label: summary.harness, value: summary.mean_score })), "score")}
${renderBarChart("Total tokens by harness", sanitized.harness_summaries.map((summary) => ({ label: summary.harness, value: summary.total_tokens })), "tokens")}
${renderBarChart("Total cost by harness", sanitized.harness_summaries.map((summary) => ({ label: summary.harness, value: summary.total_cost_usd })), "USD")}
${renderBarChart("Observability coverage by harness", sanitized.harness_summaries.map((summary) => ({ label: summary.harness, value: coverageScore(sanitized.trials.filter((trial) => trial.harness === summary.harness)) })), "fields")}
${renderBarChart("Artifact integrity by harness/spec", sanitized.harness_summaries.map((summary) => ({ label: summary.harness, value: artifactIntegrityScore(sanitized.trials.filter((trial) => trial.harness === summary.harness)) })), "present")}
</div>
</section>
<section>
<h2>Usage Observability</h2>
<h3>LLM/model by harness</h3>
${renderUsageList(sanitized, "llms")}
<h3>Subagents by harness</h3>
${renderUsageList(sanitized, "subagents")}
<h3>Skills by harness</h3>
${renderUsageList(sanitized, "skills")}
<h3>MCP usage by harness</h3>
${renderUsageList(sanitized, "mcps")}
</section>
<section>
<h2>Observability Coverage Matrix</h2>
${renderCoverageMatrix(sanitized)}
</section>
<section>
<h2>Artifact Integrity</h2>
${renderArtifactIntegrity(sanitized)}
</section>
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
<div class="views" role="group" aria-label="Report view controls">
<button type="button" data-view="aggregate" aria-pressed="true">Aggregate suite view</button>
<button type="button" data-view="per-spec" aria-pressed="false">Per-spec view</button>
<button type="button" data-view="per-trial" aria-pressed="false">Per-trial view</button>
</div>
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
document.getElementById("ranking-dimension").addEventListener("change", updateRanking);
const viewButtons = Array.from(document.querySelectorAll(".views button"));
for (const button of viewButtons) button.addEventListener("click", () => {
  for (const other of viewButtons) other.setAttribute("aria-pressed", String(other === button));
});
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
function updateRanking() {
  const dimension = document.getElementById("ranking-dimension").value;
  const rows = Array.from(document.querySelectorAll("#ranking-rows tr"));
  rows.sort((a, b) => Number(rankFor(a, dimension)) - Number(rankFor(b, dimension)));
  for (const row of rows) row.parentElement.appendChild(row);
  document.getElementById("best-harness").textContent = rows[0]?.dataset.harness || "unavailable";
}
function rankFor(row, dimension) {
  if (dimension === "cost" || dimension === "cost_per_completed_trial" || dimension === "cost_per_score_point") return row.dataset.costRank || row.dataset.rank;
  if (dimension === "tokens" || dimension === "tokens_per_completed_trial") return row.dataset.tokenRank || row.dataset.rank;
  return row.dataset.rank;
}
</script>
</body>
</html>
`;
}

const tokenMetricNames = ["token_usage", "total_tokens", "tokens"] as const;
const costMetricNames = ["cost", "total_cost_usd"] as const;

function rankingEntries(report: SuiteReport): {
  readonly summary: HarnessSuiteSummary;
  readonly overallRank: number;
  readonly costRank: number;
  readonly tokenRank: number;
}[] {
  const overall = [...report.harness_summaries].sort((left, right) =>
    right.completed - left.completed ||
    right.mean_score - left.mean_score ||
    nullableCompare(left.mean_duration_ms, right.mean_duration_ms) ||
    nullableCompare(left.total_cost_usd, right.total_cost_usd) ||
    nullableCompare(left.total_tokens, right.total_tokens) ||
    left.harness.localeCompare(right.harness)
  );
  const cost = rankByNullable(report.harness_summaries, (summary) => summary.total_cost_usd);
  const tokens = rankByNullable(report.harness_summaries, (summary) => summary.total_tokens);

  return overall.map((summary, index) => ({
    summary,
    overallRank: index + 1,
    costRank: cost.get(summary.harness) ?? report.harness_summaries.length,
    tokenRank: tokens.get(summary.harness) ?? report.harness_summaries.length
  }));
}

function rankByNullable(
  summaries: readonly HarnessSuiteSummary[],
  value: (summary: HarnessSuiteSummary) => number | null
): Map<string, number> {
  return new Map([...summaries]
    .sort((left, right) => nullableCompare(value(left), value(right)) || left.harness.localeCompare(right.harness))
    .map((summary, index) => [summary.harness, index + 1]));
}

function nullableCompare(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
}

function rankingDimensionStatus(report: SuiteReport): string {
  return report.observability.cost === "unavailable" && report.observability.token_usage === "unavailable"
    ? "unavailable"
    : report.observability.cost === "limited" ||
      report.observability.cost === "unavailable" ||
      report.observability.token_usage === "limited" ||
      report.observability.token_usage === "unavailable"
      ? "limited"
      : "available";
}

function renderSummaryMetricBadge(
  report: SuiteReport,
  harness: string,
  names: readonly string[]
): string {
  const metrics = report.trials
    .filter((trial) => trial.harness === harness)
    .flatMap((trial) => trial.metrics)
    .filter((metric) => names.includes(metric.metric));
  const first = metrics[0];

  return first === undefined ? renderSourceBadge("unavailable", "usage_capture", "none") : renderMetricBadge(first);
}

function renderMetricBadge(metric: SuiteMetricObservation): string {
  const reason = metric.unavailable_reason === undefined ? "" : ` title="${escapeHtml(metric.unavailable_reason)}"`;
  return `<span class="source-badge"${reason}>${escapeHtml(`${metric.measurement_source}/${metric.capture_source}/${metric.confidence}`)}</span>`;
}

function renderSourceBadge(measurementSource: string, captureSource: string, confidence: string): string {
  return `<span class="source-badge">${escapeHtml(`${measurementSource}/${captureSource}/${confidence}`)}</span>`;
}

function renderBarChart(
  title: string,
  values: readonly { readonly label: string; readonly value: number | null }[],
  unit: string
): string {
  const max = Math.max(1, ...values.map((item) => item.value ?? 0));
  const rows = values.map((item, index) => {
    const width = item.value === null ? 0 : Math.max(4, Math.round((item.value / max) * 160));
    const y = 30 + index * 34;
    const label = `${item.label}: ${item.value === null ? "unavailable" : `${formatNumber(item.value)} ${unit}`}`;

    return `<text x="0" y="${y + 13}" font-size="12">${escapeHtml(item.label)}</text><rect x="110" y="${y}" width="${width}" height="18" rx="3"></rect><text x="${116 + width}" y="${y + 13}" font-size="12">${escapeHtml(label.replace(`${item.label}: `, ""))}</text>`;
  }).join("");

  return `<div class="chart"><h3>${escapeHtml(title)}</h3><svg viewBox="0 0 340 ${Math.max(80, values.length * 34 + 30)}" role="img" aria-label="${escapeHtml(title)}">${rows}</svg></div>`;
}

function renderUsageList(report: SuiteReport, kind: "llms" | "subagents" | "skills" | "mcps"): string {
  const items = report.trials.flatMap((trial) => {
    const usage = trial.usage;
    if (usage === undefined) {
      return [];
    }

    if (kind === "llms") {
      return (usage.llms ?? []).map((llm) => `<li>${escapeHtml(trial.harness)}: ${escapeHtml(llm.model)} ${renderSourceBadge(llm.measurement_source, llm.capture_source, llm.confidence)}</li>`);
    }
    if (kind === "subagents") {
      return (usage.subagents ?? []).map((subagent) => {
        const token = subagent.tokens?.total;
        const cost = subagent.cost?.total_usd;
        const unavailable = [token?.unavailable_reason, cost?.unavailable_reason].filter(isString).join("; ");

        return `<li>${escapeHtml(trial.harness)}: ${escapeHtml(subagent.name ?? subagent.id)}${renderSubagentModels(subagent)} tokens ${formatUsageScalar(token)} cost ${formatUsageScalar(cost)} ${token === undefined || token === null ? "" : renderSourceBadge(token.measurement_source, token.capture_source, token.confidence)} ${unavailable === "" ? "" : escapeHtml(unavailable)}</li>`;
      });
    }
    if (kind === "skills") {
      return (usage.skills ?? []).map((skill) => `<li>${escapeHtml(trial.harness)}: ${escapeHtml(skill.name)} ${renderSourceBadge(skill.measurement_source, skill.capture_source, skill.confidence)}</li>`);
    }

    return (usage.mcps ?? []).map((mcp) => `<li>${escapeHtml(trial.harness)}: ${escapeHtml(`${mcp.server}${mcp.tool ? `.${mcp.tool}` : ""}`)} calls ${mcp.call_count ?? 0} ${renderSourceBadge(mcp.measurement_source, mcp.capture_source, mcp.confidence)}</li>`);
  });

  return `<ul class="usage-list">${items.join("") || "<li>unavailable</li>"}</ul>`;
}

function renderSubagentModels(subagent: NonNullable<SuiteUsageReport["subagents"]>[number]): string {
  const models = (subagent.llms ?? []).map((llm) => llm.model);
  return models.length === 0 ? "" : ` models ${escapeHtml(models.join(", "))}`;
}

function formatUsageScalar(value: SuiteUsageScalarObservation | null | undefined): string {
  if (value === undefined || value === null || value.value === null || value.value === undefined) {
    return "unavailable";
  }

  return `${formatNumber(value.value)}${value.unit === undefined ? "" : ` ${value.unit}`}`;
}

function renderCoverageMatrix(report: SuiteReport): string {
  const fields = ["model", "tokens", "cost", "subagents", "skills", "mcp"];
  const rows = report.selected_harnesses.map((harness) => {
    const trials = report.trials.filter((trial) => trial.harness === harness);
    return `<tr><td>${escapeHtml(harness)}</td>${fields.map((field) => `<td>${escapeHtml(coverageFor(trials, field))}</td>`).join("")}</tr>`;
  }).join("");

  return `<table><thead><tr><th>Harness</th>${fields.map((field) => `<th>${escapeHtml(field)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}

function coverageFor(trials: readonly SuiteTrialReport[], field: string): string {
  const values = trials.map((trial) => trial.usage?.coverage?.[field]).filter(isString);
  if (values.length === 0 || values.every((value) => value === "unavailable")) {
    return "unavailable";
  }
  return values.every((value) => value === "available") ? "available" : "partial";
}

function coverageScore(trials: readonly SuiteTrialReport[]): number {
  const fields = ["model", "tokens", "cost", "subagents", "skills", "mcp"];
  return fields.filter((field) => coverageFor(trials, field) !== "unavailable").length;
}

function renderArtifactIntegrity(report: SuiteReport): string {
  const rows = report.trials.flatMap((trial) =>
    artifactEntries(trial).map((artifact) => `<tr><td>${escapeHtml(trial.spec_id)}</td><td>${escapeHtml(trial.harness)}</td><td>${artifact.exists ? renderArtifactLink(artifact.ref) : escapeHtml(artifact.ref)}</td><td>${artifact.exists ? "present" : "missing optional"}</td><td>${escapeHtml(artifact.unavailable_reason ?? "")}</td></tr>`)
  ).join("");

  return `<table><thead><tr><th>Spec</th><th>Harness</th><th>Artifact</th><th>Status</th><th>Unavailable reason</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function artifactIntegrityScore(trials: readonly SuiteTrialReport[]): number {
  return trials.reduce(
    (count, trial) => count + artifactEntries(trial).filter((artifact) => artifact.exists).length,
    0
  );
}

function artifactEntries(trial: SuiteTrialReport): SuiteArtifactIndex["artifacts"] {
  return trial.artifact_integrity?.artifacts ?? trial.artifact_refs.map((ref) => ({ ref, exists: true }));
}

function formatNullable(value: number | null, suffix: string): string {
  return value === null ? "unavailable" : `${formatNumber(value)}${suffix}`;
}

function formatEfficiency(total: number | null, completed: number, suffix: string): string {
  return total === null || completed === 0 ? "unavailable" : `${formatNumber(total / completed)}${suffix}`;
}

function summarizeHarness(harness: "codex" | "claude_code", trials: readonly SuiteTrialReport[]): HarnessSuiteSummary {
  const scores = trials.map((trial) => trial.score);
  const completed = trials.filter((trial) => trial.status === "completed").length;
  const durations = trials.flatMap((trial) => trial.duration_ms === undefined ? [] : [trial.duration_ms]);
  const costs = compatibleMetricAggregate(trials, costMetricNames);
  const tokens = compatibleMetricAggregate(trials, tokenMetricNames);
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
    total_tokens: tokens.total,
    mean_tokens: tokens.mean,
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
    cost: metricAvailability(trials, costMetricNames),
    context_usage: metricAvailability(trials, ["context_usage", "context"])
  };
}

function renderArtifactLink(ref: string): string {
  return `<a href="${escapeHtml(ref)}">${escapeHtml(ref)}</a>`;
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
): { readonly total: number | null; readonly mean: number | null; readonly sources: readonly string[] } {
  const metrics = matchingMetrics(trials, metricNames);
  const values = metrics.filter((metric) => typeof metric.value === "number");
  const sources = [...new Set(values.map((metric) => metric.measurement_source))];

  if (values.length === 0 || sources.length !== 1) {
    return { total: null, mean: null, sources };
  }

  const numericValues = values.map((metric) => metric.value as number);
  return {
    total: numericValues.reduce((sum, value) => sum + value, 0),
    mean: mean(numericValues),
    sources
  };
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
  const sources = new Set(available.map((metric) => metric.measurement_source));

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
    ...metricDimensionComparabilityReasons("cost", costMetricNames, trials, harnesses)
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
    const sources = [...new Set(available.map((metric) => metric.measurement_source))];

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

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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
