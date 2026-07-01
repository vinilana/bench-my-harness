import type {
  BenchmarkReportRendererPort,
  RenderBenchmarkReportInput
} from "../../../application/ports/benchmark-report-renderer-port.js";
import type { BenchmarkReport } from "../../../domain/reports/report-model.js";

export class BenchmarkReportRenderer implements BenchmarkReportRendererPort {
  public renderBenchmarkReport(input: RenderBenchmarkReportInput): string {
    if (input.format === "json") {
      return `${JSON.stringify(input.report, null, 2)}\n`;
    }

    return renderMarkdown(input.report);
  }
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
