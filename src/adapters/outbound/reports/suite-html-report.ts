import { redactSecrets } from "../../../domain/security/redact-secrets.js";
import type {
  HarnessSuiteSummary,
  SuiteArtifactIndex,
  SuiteMetricObservation,
  SuiteReport,
  SuiteTrialReport,
  SuiteUsageScalarObservation,
  SuiteUsageReport
} from "../../../domain/reports/suite-report.js";
import type { HtmlReportRendererPort } from "../../../application/ports/html-report-renderer-port.js";
import { renderStatusPill, reportStyles } from "./report-theme.js";

export class SuiteHtmlReportRenderer implements HtmlReportRendererPort {
  public renderSuiteReport(report: SuiteReport): string {
    return renderSuiteReportHtml(report);
  }
}

export function renderSuiteReportHtml(report: SuiteReport): string {
  const sanitized = sanitizeSuiteReportForOutput(report);
  const rankingRows = rankingEntries(sanitized).map((entry) => `<tr data-harness="${escapeHtml(entry.summary.harness)}" data-rank="${entry.overallRank}" data-duration-rank="${rankAttribute(entry.durationRank)}" data-cost-rank="${rankAttribute(entry.costRank)}" data-token-rank="${rankAttribute(entry.tokenRank)}" data-token-efficiency-rank="${rankAttribute(entry.tokenEfficiencyRank)}" data-cost-completed-rank="${rankAttribute(entry.costCompletedRank)}" data-cost-score-rank="${rankAttribute(entry.costScoreRank)}">
<td>${entry.overallRank}</td>
<td>${escapeHtml(entry.summary.harness)}</td>
<td>${entry.summary.trials}</td>
<td>${entry.summary.completed}</td>
<td>${entry.summary.mean_score.toFixed(2)}</td>
<td>${formatNullable(entry.summary.mean_duration_ms, " ms")}</td>
<td>${formatNullable(entry.summary.total_cost_usd, " USD")} ${renderSummaryMetricBadge(sanitized, entry.summary.harness, ["cost", "total_cost_usd"])}</td>
<td>${formatNullable(entry.summary.total_tokens, " tokens")} ${renderSummaryMetricBadge(sanitized, entry.summary.harness, tokenMetricNames)}</td>
<td>${formatNullable(entry.summary.total_input_tokens, " tokens")} ${renderSummaryMetricBadge(sanitized, entry.summary.harness, inputTokenMetricNames)}</td>
<td>${formatNullable(entry.summary.total_output_tokens, " tokens")} ${renderSummaryMetricBadge(sanitized, entry.summary.harness, outputTokenMetricNames)}</td>
<td>${formatNullable(entry.summary.cost_per_1m_tokens, " USD")} ${renderNullableMetricBadge(entry.summary.cost_per_1m_tokens_metric)}${renderMetricEvidence(entry.summary.cost_per_1m_tokens_metric)}</td>
<td>${formatNullable(entry.summary.total_interactions, "")}</td>
<td>${formatNullable(entry.summary.total_tool_calls, "")}</td>
<td>${formatNullable(entry.summary.total_tool_failures, "")}</td>
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
<td>${renderTrialProcessDetails(trial)}</td>
<td>${renderTrialUsageDetails(trial)}</td>
<td>${renderTrialSubagentDetails(trial)}</td>
<td>${renderTrialSkillMcpDetails(trial)}</td>
<td>${escapeHtml(metricSource)} ${trial.metrics.map(renderMetricBadge).join(" ")}</td>
<td>${renderTrialArtifactDetails(trial)}</td>
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
<td>${escapeHtml(summary.total_input_tokens === null ? "unavailable" : String(summary.total_input_tokens))}</td>
<td>${escapeHtml(summary.total_output_tokens === null ? "unavailable" : String(summary.total_output_tokens))}</td>
<td>${escapeHtml(summary.cost_per_1m_tokens === null ? "unavailable" : String(summary.cost_per_1m_tokens))} ${renderNullableMetricBadge(summary.cost_per_1m_tokens_metric)}${renderMetricEvidence(summary.cost_per_1m_tokens_metric)}</td>
<td>${escapeHtml(summary.total_interactions === null ? "unavailable" : String(summary.total_interactions))}</td>
<td>${escapeHtml(summary.total_tool_calls === null ? "unavailable" : String(summary.total_tool_calls))}</td>
<td>${escapeHtml(summary.total_tool_failures === null ? "unavailable" : String(summary.total_tool_failures))}</td>
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
<thead><tr><th>Rank</th><th>Harness</th><th>Trials</th><th>Completed</th><th>Mean Score</th><th>Mean Duration</th><th>Total Cost</th><th>Total Tokens</th><th>Input Tokens</th><th>Output Tokens</th><th>Cost / 1M Tokens</th><th>Interactions</th><th>Tool Calls</th><th>Tool Failures</th><th>Tokens / Completed</th><th>Cost / Completed</th></tr></thead>
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
<h3>Token and cost by harness</h3>
${renderTokenCostUsageList(sanitized)}
<h3>LLM/model by harness</h3>
${renderUsageList(sanitized, "llms")}
<h3>Subagents by harness</h3>
${renderUsageList(sanitized, "subagents")}
<h3>Skills by harness</h3>
${renderUsageList(sanitized, "skills")}
<h3>MCP usage by harness</h3>
${renderUsageList(sanitized, "mcps")}
<h3>Hook tool calls by harness</h3>
${renderHookToolCallList(sanitized)}
</section>
<section>
<h2>Observability Coverage Matrix</h2>
${renderCoverageMatrix(sanitized)}
</section>
<section>
<h2>Adapter Capabilities</h2>
${renderAdapterCapabilities(sanitized)}
</section>
<section>
<h2>Artifact Integrity</h2>
${renderArtifactIntegrity(sanitized)}
</section>
<section>
<h2>Harness Summary</h2>
<table>
<thead><tr><th>Harness</th><th>Trials</th><th>Completed</th><th>Failed</th><th>Pass Rate</th><th>Mean Score</th><th>Mean Duration</th><th>Total Cost</th><th>Total Tokens</th><th>Input Tokens</th><th>Output Tokens</th><th>Cost / 1M Tokens</th><th>Interactions</th><th>Tool Calls</th><th>Tool Failures</th><th>Unavailable Metrics</th></tr></thead>
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
<thead><tr><th>Spec</th><th>Harness</th><th>Trial</th><th>Status</th><th>Score</th><th>Comparability</th><th>Process</th><th>Usage</th><th>Subagents</th><th>Skills / MCP</th><th>Metric Data</th><th>Artifacts</th></tr></thead>
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
  if (dimension === "duration") return rankOrInfinity(row.dataset.durationRank);
  if (dimension === "cost") return rankOrInfinity(row.dataset.costRank);
  if (dimension === "tokens") return rankOrInfinity(row.dataset.tokenRank);
  if (dimension === "tokens_per_completed_trial") return rankOrInfinity(row.dataset.tokenEfficiencyRank);
  if (dimension === "cost_per_completed_trial") return rankOrInfinity(row.dataset.costCompletedRank);
  if (dimension === "cost_per_score_point") return rankOrInfinity(row.dataset.costScoreRank);
  return row.dataset.rank;
}
function rankOrInfinity(value) {
  return value === "" ? "Infinity" : value || "Infinity";
}
</script>
</body>
</html>
`;
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

function rankingEntries(report: SuiteReport): {
  readonly summary: HarnessSuiteSummary;
  readonly overallRank: number;
  readonly durationRank: number | null;
  readonly costRank: number | null;
  readonly tokenRank: number | null;
  readonly tokenEfficiencyRank: number | null;
  readonly costCompletedRank: number | null;
  readonly costScoreRank: number | null;
}[] {
  const overall = [...report.harness_summaries].sort((left, right) =>
    right.completed - left.completed ||
    right.mean_score - left.mean_score ||
    nullableCompare(left.mean_duration_ms, right.mean_duration_ms) ||
    nullableCompare(left.total_cost_usd, right.total_cost_usd) ||
    nullableCompare(left.total_tokens, right.total_tokens) ||
    left.harness.localeCompare(right.harness)
  );
  const duration = rankByNullable(report.harness_summaries, (summary) => summary.mean_duration_ms);
  const cost = rankByNullable(report.harness_summaries, (summary) => summary.total_cost_usd);
  const tokens = rankByNullable(report.harness_summaries, (summary) => summary.total_tokens);
  const tokenEfficiency = rankByNullable(report.harness_summaries, tokensPerCompletedTrial);
  const costCompleted = rankByNullable(report.harness_summaries, costPerCompletedTrial);
  const costScore = rankByNullable(report.harness_summaries, costPerScorePoint);

  return overall.map((summary, index) => ({
    summary,
    overallRank: index + 1,
    durationRank: duration.get(summary.harness) ?? null,
    costRank: cost.get(summary.harness) ?? null,
    tokenRank: tokens.get(summary.harness) ?? null,
    tokenEfficiencyRank: tokenEfficiency.get(summary.harness) ?? null,
    costCompletedRank: costCompleted.get(summary.harness) ?? null,
    costScoreRank: costScore.get(summary.harness) ?? null
  }));
}

function tokensPerCompletedTrial(summary: HarnessSuiteSummary): number | null {
  return summary.total_tokens === null || summary.completed === 0 ? null : summary.total_tokens / summary.completed;
}

function costPerCompletedTrial(summary: HarnessSuiteSummary): number | null {
  return summary.total_cost_usd === null || summary.completed === 0 ? null : summary.total_cost_usd / summary.completed;
}

function costPerScorePoint(summary: HarnessSuiteSummary): number | null {
  const scorePoints = summary.mean_score * summary.completed;
  return summary.total_cost_usd === null || scorePoints <= 0 ? null : summary.total_cost_usd / scorePoints;
}

function rankByNullable(
  summaries: readonly HarnessSuiteSummary[],
  value: (summary: HarnessSuiteSummary) => number | null
): Map<string, number> {
  return new Map([...summaries]
    .filter((summary) => value(summary) !== null)
    .sort((left, right) => nullableCompare(value(left), value(right)) || left.harness.localeCompare(right.harness))
    .map((summary, index) => [summary.harness, index + 1]));
}

function rankAttribute(value: number | null): string {
  return value === null ? "" : String(value);
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

function renderNullableMetricBadge(metric: SuiteMetricObservation | null | undefined): string {
  return metric === null || metric === undefined ? renderSourceBadge("unavailable", "suite_summary_ratio", "none") : renderMetricBadge(metric);
}

function renderMetricEvidence(metric: SuiteMetricObservation | null | undefined, trial?: SuiteTrialReport): string {
  const refs = metric?.evidence_refs ?? [];
  if (refs.length === 0) {
    return "";
  }

  return ` <span class="metric-evidence">evidence ${refs.map((ref) => renderEvidenceRef(ref, trial)).join(", ")}</span>`;
}

function renderEvidenceRef(ref: string, trial?: SuiteTrialReport): string {
  const artifactRef = trial === undefined ? undefined : resolveTrialEvidenceRef(trial, ref);
  if (artifactRef !== undefined) {
    return renderArtifactLink(artifactRef, ref);
  }

  return ref.includes("/") ? renderArtifactLink(ref) : `<code>${escapeHtml(ref)}</code>`;
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

function renderTokenCostUsageList(report: SuiteReport): string {
  const items = report.trials.flatMap((trial) => {
    const usage = trial.usage;
    if (usage === undefined) {
      return [];
    }

    const total = usage.tokens?.total;
    const input = usage.tokens?.input;
    const output = usage.tokens?.output;
    const cacheRead = usage.tokens?.cache_read;
    const cacheWrite = usage.tokens?.cache_write;
    const cost = usage.cost?.total_usd;
    const tokenBadge = total === undefined || total === null
      ? renderSourceBadge("unavailable", "usage_capture", "none")
      : renderSourceBadge(total.measurement_source, total.capture_source, total.confidence);
    const costBadge = cost === undefined || cost === null
      ? renderSourceBadge("unavailable", "usage_capture", "none")
      : renderSourceBadge(cost.measurement_source, cost.capture_source, cost.confidence);

    return [`<li>${escapeHtml(`${trial.harness} ${trial.trial_id}`)}: total ${formatUsageScalar(total)}, input ${formatUsageScalar(input)}, output ${formatUsageScalar(output)}, cache read ${formatUsageScalar(cacheRead)}, cache write ${formatUsageScalar(cacheWrite)}, cost ${formatUsageScalar(cost)} ${tokenBadge} ${costBadge}</li>`];
  });

  return `<ul class="usage-list">${items.join("") || "<li>unavailable</li>"}</ul>`;
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

function renderHookToolCallList(report: SuiteReport): string {
  const rows = report.trials.flatMap((trial) => {
    const failureMetric = metricByName(trial, "tool_calls_failed");
    return trial.metrics
      .filter((metric) => metric.metric.startsWith("tool_calls_by_type."))
      .map((metric) => {
        const toolName = metric.metric.slice("tool_calls_by_type.".length);
        return `<tr><td>${escapeHtml(trial.harness)}</td><td>${escapeHtml(trial.trial_id)}</td><td>${escapeHtml(toolName)}</td><td>${formatMetricObservation(metric)}</td><td>${formatMetricObservation(failureMetric)}</td><td>${renderMetricBadge(metric)}${renderMetricEvidence(metric, trial)}</td><td>${failureMetric === undefined ? "" : `${renderMetricBadge(failureMetric)}${renderMetricEvidence(failureMetric, trial)}`}</td></tr>`;
      });
  }).join("");

  return `<table><thead><tr><th>Harness</th><th>Trial</th><th>Tool</th><th>Hook-observed calls</th><th>Trial tool failures</th><th>Call source</th><th>Failure source</th></tr></thead><tbody>${rows || "<tr><td colspan=\"7\">unavailable</td></tr>"}</tbody></table>`;
}

function renderTrialProcessDetails(trial: SuiteTrialReport): string {
  const process = trial.diagnostics?.process;
  const duration = trial.duration_ms ?? process?.duration_ms ?? null;
  const exit = process === undefined
    ? "exit unavailable"
    : `exit ${process.exit_code}${process.timed_out ? " timed out" : ""}`;
  const refs = process === undefined
    ? []
    : [
        process.stdout_ref,
        process.stderr_ref,
        process.exit_ref
      ];

  return `<div><b>Process Duration</b> duration ${formatNullable(duration, " ms")}</div><div><b>Exit Status</b> ${escapeHtml(exit)}</div>${refs.length === 0 ? "" : `<div>evidence ${refs.map((ref) => renderArtifactLink(ref)).join(", ")}</div>`}`;
}

function renderTrialUsageDetails(trial: SuiteTrialReport): string {
  const usage = trial.usage;
  const llms = usage?.llms ?? [];
  const modelRows = llms.length === 0
    ? ["Model unavailable"]
    : llms.map((llm) => `Model ${escapeHtml(llm.model)} ${renderSourceBadge(llm.measurement_source, llm.capture_source, llm.confidence)}${renderEvidenceRefs(llm.evidence_refs, trial)}`);
  const observations = [
    renderObservationLine("total", usage?.tokens?.total ?? metricByName(trial, "token_usage"), trial),
    renderObservationLine("input", usage?.tokens?.input ?? metricByName(trial, "input_tokens"), trial),
    renderObservationLine("output", usage?.tokens?.output ?? metricByName(trial, "output_tokens"), trial),
    renderObservationLine("cache read", usage?.tokens?.cache_read ?? metricByName(trial, "cache_read_tokens"), trial),
    renderObservationLine("cache write", usage?.tokens?.cache_write ?? metricByName(trial, "cache_write_tokens"), trial),
    renderObservationLine("cost", usage?.cost?.total_usd ?? metricByName(trial, "cost"), trial)
  ];

  return `<ul class="usage-list">${[...modelRows, ...observations].map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function renderTrialSubagentDetails(trial: SuiteTrialReport): string {
  const subagents = trial.usage?.subagents ?? [];
  if (subagents.length === 0) {
    return "Subagents unavailable";
  }

  return `<ul class="usage-list">${subagents.map((subagent) => {
    const token = subagent.tokens?.total;
    const cost = subagent.cost?.total_usd;
    return `<li>Subagent ${escapeHtml(subagent.name ?? subagent.id)}${renderSubagentModels(subagent)} ${renderObservationLine("tokens", token, trial)} ${renderObservationLine("cost", cost, trial)}${renderEvidenceRefs(subagent.evidence_refs, trial)}</li>`;
  }).join("")}</ul>`;
}

function renderTrialSkillMcpDetails(trial: SuiteTrialReport): string {
  const usage = trial.usage;
  const skills = (usage?.skills ?? []).map((skill) =>
    `Skill ${escapeHtml(skill.name)} ${renderSourceBadge(skill.measurement_source, skill.capture_source, skill.confidence)}${renderEvidenceRefs(skill.evidence_refs, trial)}`
  );
  const mcps = (usage?.mcps ?? []).map((mcp) =>
    `MCP ${escapeHtml(`${mcp.server}${mcp.tool === undefined ? "" : `.${mcp.tool}`}`)} calls ${mcp.call_count ?? 0} ${renderSourceBadge(mcp.measurement_source, mcp.capture_source, mcp.confidence)}${renderEvidenceRefs(mcp.evidence_refs, trial)}`
  );
  const rows = [...skills, ...mcps];

  return rows.length === 0 ? "Skills and MCP unavailable" : `<ul class="usage-list">${rows.map((row) => `<li>${row}</li>`).join("")}</ul>`;
}

function renderTrialArtifactDetails(trial: SuiteTrialReport): string {
  const refs = trial.artifact_refs.map((ref) => renderArtifactLink(ref));
  const missing = artifactEntries(trial)
    .filter((artifact) => !artifact.exists)
    .map((artifact) => `missing optional ${escapeHtml(artifact.ref)}${artifact.unavailable_reason === undefined ? "" : `: ${escapeHtml(artifact.unavailable_reason)}`}`);
  return [...refs, ...missing].join(", ");
}

function metricByName(trial: SuiteTrialReport, name: string): SuiteMetricObservation | undefined {
  return trial.metrics.find((metric) => metric.metric === name);
}

function formatMetricObservation(metric: SuiteMetricObservation | undefined): string {
  if (metric === undefined || metric.value === null || metric.value === undefined) {
    return "unavailable";
  }

  return `${formatNumber(metric.value)}${metric.unit === undefined ? "" : ` ${metric.unit}`}`;
}

type ReportObservation = Pick<
  SuiteMetricObservation,
  "value" | "unit" | "measurement_source" | "capture_source" | "confidence" | "unavailable_reason" | "evidence_refs"
>;

function renderObservationLine(label: string, observation: ReportObservation | null | undefined, trial?: SuiteTrialReport): string {
  if (observation === null || observation === undefined) {
    return `${escapeHtml(label)} unavailable ${renderSourceBadge("unavailable", "usage_capture", "none")}`;
  }

  const value = observation.value === null || observation.value === undefined
    ? "unavailable"
    : `${formatNumber(observation.value)}${observation.unit === undefined ? "" : ` ${observation.unit}`}`;
  const reason = observation.unavailable_reason === undefined ? "" : ` (${escapeHtml(observation.unavailable_reason)})`;

  return `${escapeHtml(label)} ${escapeHtml(value)}${reason} ${renderSourceBadge(observation.measurement_source, observation.capture_source, observation.confidence)}${renderEvidenceRefs(observation.evidence_refs, trial)}`;
}

function renderEvidenceRefs(refs: readonly string[] | undefined, trial?: SuiteTrialReport): string {
  if (refs === undefined || refs.length === 0) {
    return "";
  }

  return ` <span class="metric-evidence">evidence ${refs.map((ref) => renderEvidenceRef(ref, trial)).join(", ")}</span>`;
}

function resolveTrialEvidenceRef(trial: SuiteTrialReport, ref: string): string | undefined {
  if (ref.includes("/") || ref.startsWith("event:")) {
    return undefined;
  }

  return trial.artifact_refs.find((artifactRef) => artifactRef === ref || artifactRef.endsWith(`/${ref}`));
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

function renderAdapterCapabilities(report: SuiteReport): string {
  const rows = report.trials.flatMap((trial) => {
    const matrix = trial.adapter_capabilities;
    if (matrix === undefined) {
      return [`<tr><td>${escapeHtml(trial.harness)}</td><td>${escapeHtml(trial.trial_id)}</td><td>unavailable</td><td>unavailable</td><td>adapter_capabilities</td><td>unavailable</td><td>unavailable</td></tr>`];
    }

    return Object.entries(matrix.capabilities).map(([capability, value]) =>
      `<tr><td>${escapeHtml(matrix.provider)}</td><td>${escapeHtml(trial.trial_id)}</td><td>${escapeHtml(matrix.adapter_version)}</td><td>${escapeHtml((matrix.supported_provider_versions ?? []).join("; ") || "unavailable")}</td><td>${escapeHtml(capability)}</td><td>${escapeHtml(String(value))}</td><td>${escapeHtml((matrix.capability_evidence?.[capability] ?? []).join(", ") || "unavailable")}</td></tr>`
    );
  }).join("");

  return `<table><thead><tr><th>Harness</th><th>Trial</th><th>Adapter Version</th><th>Supported Provider Versions</th><th>Capability</th><th>Value</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    artifactEntries(trial).map((artifact) => `<tr><td>${escapeHtml(trial.spec_id)}</td><td>${escapeHtml(trial.harness)}</td><td>${artifact.exists ? renderArtifactLink(artifactHref(trial, artifact.ref), artifact.ref) : escapeHtml(artifact.ref)}</td><td>${artifact.exists ? "present" : "missing optional"}</td><td>${escapeHtml(artifact.unavailable_reason ?? "")}</td></tr>`)
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

function artifactHref(trial: SuiteTrialReport, ref: string): string {
  if (ref.includes("/")) {
    return ref;
  }

  return trial.artifact_refs.find((artifactRef) => artifactRef.endsWith(`/${ref}`)) ?? ref;
}

function formatNullable(value: number | null | undefined, suffix: string): string {
  return value === null || value === undefined ? "unavailable" : `${formatNumber(value)}${suffix}`;
}

function formatEfficiency(total: number | null | undefined, completed: number, suffix: string): string {
  return total === null || total === undefined || completed === 0 ? "unavailable" : `${formatNumber(total / completed)}${suffix}`;
}

function renderArtifactLink(ref: string, label = ref): string {
  return `<a href="${escapeHtml(ref)}">${escapeHtml(label)}</a>`;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function sanitizeSuiteReportForOutput(report: SuiteReport): SuiteReport {
  const redaction = { applied: false };
  const sanitized = redactUnknown(report, redaction) as SuiteReport & { raw_payloads?: unknown };
  const { raw_payloads: _rawPayloads, ...withoutRawPayloads } = sanitized;

  return {
    ...withoutRawPayloads,
    security: {
      ...withoutRawPayloads.security,
      redaction: {
        ...withoutRawPayloads.security.redaction,
        status: redaction.applied ? "applied" : "not_needed",
        raw_payloads_included: false
      }
    }
  };
}

function redactUnknown(value: unknown, redaction: { applied: boolean }): unknown {
  if (typeof value === "string") {
    const result = redactSecrets(value);
    redaction.applied = redaction.applied || result.redactionApplied;
    return result.redacted;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, redaction));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nested]) =>
        key === "raw_payloads" || nested === undefined ? [] : [[key, redactUnknown(nested, redaction)]]
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
