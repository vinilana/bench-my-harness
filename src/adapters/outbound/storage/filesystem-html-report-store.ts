import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SuiteReport, SuiteTrialReport } from "../../../domain/reports/suite-report.js";
import { renderStatusPill, reportStyles } from "../reports/report-theme.js";
import { renderSuiteReportHtml } from "../reports/suite-html-report.js";
import { redactSecrets } from "../../../domain/security/redact-secrets.js";

interface HtmlTrial {
  readonly spec_id: string;
  readonly spec_version: string;
  readonly harness: string;
  readonly trial_id: string;
  readonly status: string;
  readonly failure_classification?: string;
  readonly score: number;
  readonly duration_ms?: number;
  readonly tags: readonly string[];
  readonly artifact_refs: readonly string[];
  readonly comparability: {
    readonly status: string;
    readonly reasons: readonly string[];
  };
  readonly metrics: readonly {
    readonly metric: string;
    readonly measurement_source: string;
    readonly capture_source: string;
    readonly confidence: string;
    readonly value?: number;
  }[];
  readonly notes: readonly string[];
}

interface HtmlReport {
  readonly run_id: string;
  readonly suite: {
    readonly id: string;
    readonly name: string;
    readonly version: string;
  };
  readonly generated_at: string;
  readonly selected_harnesses: readonly string[];
  readonly specs: readonly {
    readonly id: string;
    readonly version: string;
    readonly tags: readonly string[];
  }[];
  readonly trials: readonly HtmlTrial[];
  readonly comparability: {
    readonly status: string;
    readonly reasons: readonly string[];
  };
  readonly security: {
    readonly redaction: {
      readonly status: string;
      readonly raw_payloads_included: boolean;
    };
  };
}

export class FilesystemHtmlReportStore {
  public constructor(private readonly options: { root: string }) {}

  public async save(input: SuiteReport | unknown): Promise<{ path: string; html: string }> {
    if (isSuiteReport(input)) {
      const html = renderSuiteReportHtml(input);
      const path = join(this.runDir(input.run_id), "report.html");

      await mkdir(this.runDir(input.run_id), { recursive: true });
      await writeFile(path, html, "utf8");

      return { path, html };
    }

    const normalized = normalizeReport(input);
    const html = renderHtml(normalized);
    const path = join(this.runDir(normalized.run_id), "report.html");

    await mkdir(this.runDir(normalized.run_id), { recursive: true });
    await writeFile(path, html, "utf8");

    return { path, html };
  }

  public async renderFromRun(runId: string): Promise<{ path: string; html: string } | undefined> {
    try {
      return this.save(JSON.parse(await readFile(join(this.runDir(runId), "results.json"), "utf8")) as unknown);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }

      throw new Error(`stored suite result could not be loaded for run ${runId}`);
    }
  }

  private runDir(runId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
      throw new Error("invalid run id for HTML report storage");
    }

    return join(this.options.root, runId);
  }
}

function isSuiteReport(value: unknown): value is SuiteReport {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "run_id" in value &&
    "global_summary" in value &&
    "harness_summaries" in value &&
    "spec_summaries" in value;
}

function renderHtml(input: HtmlReport): string {
  const redactionState = { applied: false };
  const redacted = redactUnknown(input, redactionState) as HtmlReport;
  const report: HtmlReport = {
    ...redacted,
    security: {
      ...redacted.security,
      redaction: {
        ...redacted.security.redaction,
        status: redactionStatus(redacted.security.redaction.status, redactionState.applied),
        raw_payloads_included: false
      }
    }
  };
  const harnesses = Array.from(new Set(report.selected_harnesses.length > 0 ? report.selected_harnesses : report.trials.map((trial) => trial.harness))).sort();
  const specs = report.specs.length > 0 ? report.specs : specsFromTrials(report.trials);
  const tags = Array.from(new Set(specs.flatMap((spec) => spec.tags))).sort();
  const statuses = Array.from(new Set(report.trials.map((trial) => trial.status))).sort();
  const comparabilityStatuses = Array.from(new Set(report.trials.map((trial) => trial.comparability.status))).sort();
  const summaries = harnesses.map((harness) => summarizeHarness(harness, report.trials.filter((trial) => trial.harness === harness)));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(report.suite.name)} ${escapeHtml(report.run_id)}</title>
<style>${reportStyles()}</style>
</head>
<body>
<header class="app-header"><div class="app-header__inner">
<h1>${escapeHtml(report.suite.name)}</h1>
<div class="chips">
<span class="chip">Run <b>${escapeHtml(report.run_id)}</b></span>
<span class="chip">Suite <b>${escapeHtml(report.suite.id)}@${escapeHtml(report.suite.version)}</b></span>
<span class="chip">Generated <b>${escapeHtml(report.generated_at)}</b></span>
<span class="chip">Harnesses <b>${harnesses.map(escapeHtml).join(", ")}</b></span>
<span class="chip">Comparability ${renderStatusPill(report.comparability.status)}</span>
</div>
</div></header>
<main>
<section>
<h2>Global Benchmark Summary</h2>
<div class="summary">
<div class="metric"><span class="metric__label">Specs attempted</span><span class="metric__value">${specs.length}</span></div>
<div class="metric"><span class="metric__label">Trials attempted</span><span class="metric__value">${report.trials.length}</span></div>
<div class="metric"><span class="metric__label">Completed</span><span class="metric__value">${countStatus(report.trials, "completed")}</span></div>
<div class="metric"><span class="metric__label">Failed</span><span class="metric__value">${countStatus(report.trials, "failed")}</span></div>
<div class="metric"><span class="metric__label">Inconclusive</span><span class="metric__value">${report.trials.filter((trial) => trial.comparability.status !== "comparable").length}</span></div>
<div class="metric"><span class="metric__label">Comparability</span><span class="metric__value" style="font-size:18px">${escapeHtml(report.comparability.status)}</span></div>
</div>
<p class="section-note">Unavailable token, cost, or context metrics are shown explicitly as unavailable.</p>
<p class="section-note">Comparability reasons: ${report.comparability.reasons.map(escapeHtml).join("; ") || "none"}.</p>
<p class="section-note">Redaction: ${escapeHtml(report.security.redaction.status)}. Raw payloads included: ${String(report.security.redaction.raw_payloads_included)}.</p>
</section>
<section>
<h2>Pass rate by harness</h2>
<table><thead><tr><th>Harness</th><th>Pass rate</th><th>Scores</th><th>Mean duration</th><th>Unavailable metrics</th></tr></thead><tbody>${summaries.map(renderHarnessSummaryRow).join("")}</tbody></table>
</section>
<section>
<h2>Filters</h2>
<div class="filters">
${renderSelect("filter-harness", "Harness", harnesses)}
${renderSelect("filter-spec", "Spec", specs.map((spec) => spec.id))}
${renderSelect("filter-tag", "Tag", tags)}
${renderSelect("filter-status", "Status", statuses)}
${renderSelect("filter-comparability", "Comparability", comparabilityStatuses)}
</div>
</section>
<section>
<h2>Per-Spec Summary</h2>
<table><thead><tr><th>Spec</th><th>Version</th><th>Tags</th></tr></thead><tbody>${specs.map((spec) => `<tr><td>${escapeHtml(spec.id)}</td><td>${escapeHtml(spec.version)}</td><td>${spec.tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}</td></tr>`).join("")}</tbody></table>
</section>
<section>
<h2>Trial Details</h2>
<div class="trials">${report.trials.map((trial) => renderTrial(trial, specs.find((spec) => spec.id === trial.spec_id)?.tags ?? trial.tags)).join("")}</div>
</section>
</main>
<script>
const filters = ["filter-harness", "filter-spec", "filter-tag", "filter-status", "filter-comparability"];
function applyFilters() {
  const selected = Object.fromEntries(filters.map((id) => [id, document.getElementById(id).value]));
  for (const row of document.querySelectorAll(".trial")) {
    const tags = row.dataset.tags.split(",");
    row.hidden =
      (selected["filter-harness"] && row.dataset.harness !== selected["filter-harness"]) ||
      (selected["filter-spec"] && row.dataset.spec !== selected["filter-spec"]) ||
      (selected["filter-tag"] && !tags.includes(selected["filter-tag"])) ||
      (selected["filter-status"] && row.dataset.status !== selected["filter-status"]) ||
      (selected["filter-comparability"] && row.dataset.comparability !== selected["filter-comparability"]);
  }
}
for (const id of filters) document.getElementById(id).addEventListener("change", applyFilters);
</script>
</body>
</html>
`;
}

function normalizeReport(input: unknown): HtmlReport {
  const redactionState = { applied: false };
  const sanitized = redactUnknown(input, redactionState) as Record<string, unknown>;
  const trials = Array.isArray(sanitized.trials) ? sanitized.trials.map(normalizeTrial) : [];
  const suite = objectField(sanitized.suite);
  const globalSummary = objectField(sanitized.global_summary);
  const comparability = objectField(sanitized.comparability);
  const security = objectField(sanitized.security);
  const redaction = objectField(security.redaction);

  return {
    run_id: stringField(sanitized.run_id) ?? "unknown",
    suite: {
      id: stringField(suite.id) ?? "unknown",
      name: stringField(suite.name) ?? "Spec suite",
      version: stringField(suite.version) ?? "unknown"
    },
    generated_at: stringField(sanitized.generated_at) ?? new Date().toISOString(),
    selected_harnesses: stringArray(sanitized.selected_harnesses),
    specs: Array.isArray(sanitized.specs) ? sanitized.specs.map(normalizeSpec) : specsFromTrials(trials),
    trials,
    comparability: {
      status: stringField(comparability.status) ?? stringField(globalSummary.comparability_status) ?? "limited",
      reasons: stringArray(comparability.reasons).concat(stringArray(globalSummary.comparability_reasons))
    },
    security: {
      redaction: {
        status: redactionStatus(stringField(redaction.status), redactionState.applied),
        raw_payloads_included: false
      }
    }
  };
}

function normalizeTrial(value: unknown): HtmlTrial {
  const trial = objectField(value);
  const comparability = objectField(trial.comparability);
  const legacyMetrics = objectField(trial.metrics);
  const metrics = Array.isArray(trial.metrics)
    ? trial.metrics.map(normalizeMetric)
    : ["tokens", "cost", "context"].map((metric) => normalizeMetric({ metric, ...objectField(legacyMetrics[metric]) }));

  return {
    spec_id: stringField(trial.spec_id) ?? "unknown",
    spec_version: stringField(trial.spec_version) ?? "unknown",
    harness: stringField(trial.harness) ?? "unknown",
    trial_id: stringField(trial.trial_id) ?? "unknown",
    status: stringField(trial.status) ?? "unknown",
    failure_classification: stringField(trial.failure_classification),
    score: numberField(trial.score) ?? 0,
    duration_ms: numberField(trial.duration_ms),
    tags: stringArray(trial.tags),
    artifact_refs: stringArray(trial.artifact_refs).concat(stringArray(trial.artifacts)),
    comparability: {
      status: stringField(comparability.status) ?? "limited",
      reasons: stringArray(comparability.reasons)
    },
    metrics,
    notes: stringArray(trial.notes)
  };
}

function normalizeMetric(value: unknown): HtmlTrial["metrics"][number] {
  const metric = objectField(value);
  const status = stringField(metric.status);
  return {
    metric: stringField(metric.metric) ?? "metric",
    value: numberField(metric.value),
    measurement_source: stringField(metric.measurement_source) ?? (status === "unavailable" ? "unavailable" : "unknown"),
    capture_source: stringField(metric.capture_source) ?? "unknown",
    confidence: stringField(metric.confidence) ?? "unknown"
  };
}

function normalizeSpec(value: unknown): HtmlReport["specs"][number] {
  const spec = objectField(value);
  return {
    id: stringField(spec.id) ?? "unknown",
    version: stringField(spec.version) ?? "unknown",
    tags: stringArray(spec.tags)
  };
}

function renderHarnessSummaryRow(summary: ReturnType<typeof summarizeHarness>): string {
  return `<tr><td>${escapeHtml(summary.harness)}</td><td>${formatNumber(summary.passRate)}%</td><td>mean ${formatNumber(summary.mean)}, median ${formatNumber(summary.median)}, min ${formatNumber(summary.min)}, max ${formatNumber(summary.max)}, stddev ${formatNumber(summary.stddev)}</td><td>${formatNumber(summary.meanDurationMs)} ms</td><td>${summary.unavailableMetrics}</td></tr>`;
}

function renderTrial(trial: HtmlTrial, tags: readonly string[]): string {
  return `<article class="trial" data-harness="${escapeHtml(trial.harness)}" data-spec="${escapeHtml(trial.spec_id)}" data-tags="${escapeHtml(tags.join(","))}" data-status="${escapeHtml(trial.status)}" data-comparability="${escapeHtml(trial.comparability.status)}">
<h3>${escapeHtml(trial.spec_id)} · ${escapeHtml(trial.harness)} · ${escapeHtml(trial.trial_id)}</h3>
<p><b>Status:</b> ${renderStatusPill(trial.status)}${trial.failure_classification ? ` <b>Failure:</b> ${escapeHtml(trial.failure_classification)}` : ""} · <b>Score:</b> ${formatNumber(trial.score)}${trial.duration_ms === undefined ? "" : ` · <b>Duration:</b> ${formatNumber(trial.duration_ms)} ms`}</p>
<p><b>Metrics:</b> ${trial.metrics.map((metric) => `${escapeHtml(metric.metric)} ${escapeHtml(metric.measurement_source)} (${escapeHtml(metric.capture_source)}/${escapeHtml(metric.confidence)})`).join(", ")}</p>
<p><b>Comparability:</b> ${renderStatusPill(trial.comparability.status)} ${trial.comparability.reasons.map(escapeHtml).join("; ")}</p>
<p><b>Artifacts:</b> ${trial.artifact_refs.map(renderArtifactLink).join(" ") || "none"}</p>
<p><b>Notes:</b> ${trial.notes.map(escapeHtml).join("; ") || "none"}</p>
</article>`;
}

function renderArtifactLink(artifact: string): string {
  return `<a href="${escapeHtml(artifact)}"><code>${escapeHtml(artifact)}</code></a>`;
}

function renderSelect(id: string, label: string, values: readonly string[]): string {
  return `<label for="${id}">${escapeHtml(label)}<select id="${id}"><option value="">All</option>${Array.from(new Set(values)).sort().map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}</select></label>`;
}

function summarizeHarness(harness: string, trials: readonly HtmlTrial[]) {
  const scores = trials.map((trial) => trial.score);
  const durations = trials.flatMap((trial) => (trial.duration_ms === undefined ? [] : [trial.duration_ms]));
  return {
    harness,
    passRate: trials.length === 0 ? 0 : (countStatus(trials, "completed") / trials.length) * 100,
    mean: mean(scores),
    median: median(scores),
    min: scores.length === 0 ? 0 : Math.min(...scores),
    max: scores.length === 0 ? 0 : Math.max(...scores),
    stddev: stddev(scores),
    meanDurationMs: mean(durations),
    unavailableMetrics: trials.reduce(
      (count, trial) => count + trial.metrics.filter((metric) => metric.measurement_source === "unavailable").length,
      0
    )
  };
}

function specsFromTrials(trials: readonly HtmlTrial[]): HtmlReport["specs"] {
  const byId = new Map<string, HtmlReport["specs"][number]>();
  for (const trial of trials) {
    byId.set(trial.spec_id, {
      id: trial.spec_id,
      version: trial.spec_version,
      tags: trial.tags
    });
  }
  return [...byId.values()];
}

function countStatus(trials: readonly HtmlTrial[], status: string): number {
  return trials.filter((trial) => trial.status === status).length;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function stddev(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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

function redactionStatus(inputStatus: string | undefined, redactionApplied: boolean): string {
  if (redactionApplied || inputStatus === "applied") {
    return "applied";
  }

  return "not_needed";
}

function objectField(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
