import type { BenchmarkReport, ReportFormat } from "../../domain/reports/report-model.js";

export interface RenderBenchmarkReportInput {
  readonly format: ReportFormat;
  readonly report: BenchmarkReport;
}

export interface BenchmarkReportRendererPort {
  renderBenchmarkReport(input: RenderBenchmarkReportInput): string;
}
