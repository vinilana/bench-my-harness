import { redactSecrets } from "../security/redact-secrets.js";
import type { BenchmarkReport, ReportFormat } from "./report-model.js";

export interface ExportReportInput {
  readonly format: ReportFormat;
  readonly report: BenchmarkReport;
  readonly includeRawPayloads?: boolean;
}

export function serializeReport(input: ExportReportInput): string {
  const report = sanitizeReport(input.report, input.includeRawPayloads ?? false);

  if (input.format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderMarkdown(report);
}

function sanitizeReport(report: BenchmarkReport, includeRawPayloads: boolean): BenchmarkReport {
  const withoutRawPayloads: BenchmarkReport = includeRawPayloads
    ? report
    : {
      ...report,
      raw_payloads: undefined,
      security: {
        ...report.security,
        redaction: {
          ...report.security.redaction,
          raw_payloads_included: false
        }
      }
    };

  return redactUnknown(withoutRawPayloads) as BenchmarkReport;
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
        nested === undefined ? [] : [[key, redactUnknown(nested)]]
      )
    );
  }

  return value;
}

function renderMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [
    `# Bench My Harness Report: ${report.benchmark.id}`,
    "",
    `- Run: ${report.run_id}`,
    `- Provider: ${report.provider}`,
    `- Benchmark version: ${report.benchmark.version}`,
    `- Generated: ${report.generated_at}`,
    `- Comparability: ${report.comparability.status}`,
    `- Redaction: ${report.security.redaction.status}`,
    `- Raw payloads included: ${String(report.security.redaction.raw_payloads_included)}`,
    "",
    "## Effective Observability",
    "",
    "| Capability | Coverage |",
    "| --- | --- |",
    ...Object.entries(report.effective_observability).map(([capability, coverage]) =>
      `| ${capability} | ${coverage} |`
    ),
    "",
    "## Adapter Capabilities",
    "",
    ...report.adapter_capabilities.map((capability) => `- ${capability}`),
    "",
    "## Evaluation",
    "",
    `- Score: ${report.evaluation.score_total}`,
    `- Trials: ${report.evaluation.statistics.trials}`,
    `- Mean: ${report.evaluation.statistics.mean}`,
    `- Median: ${report.evaluation.statistics.median}`,
    `- Min: ${report.evaluation.statistics.min}`,
    `- Max: ${report.evaluation.statistics.max}`,
    `- Stddev: ${report.evaluation.statistics.stddev}`,
    "",
    "## Metrics",
    "",
    "| Metric | Value | Unit | Source | Capture | Confidence | Evidence |",
    "| --- | ---: | --- | --- | --- | --- | --- |",
    ...report.metrics.map((metric) => [
      metric.metric,
      metric.value ?? "unavailable",
      metric.unit ?? "",
      metric.measurement_source,
      metric.capture_source,
      metric.confidence,
      metric.supporting_event_id ?? metric.supporting_artifact_id ?? ""
    ].join(" | ")).map((row) => `| ${row} |`)
  ];

  if (report.comparability.reasons.length > 0) {
    lines.push("", "## Comparability Reasons", "", ...report.comparability.reasons.map((reason) => `- ${reason}`));
  }

  if (report.notes && report.notes.length > 0) {
    lines.push("", "## Notes", "", ...report.notes.map((note) => `- ${note}`));
  }

  return `${lines.join("\n")}\n`;
}
