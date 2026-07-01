import type { SuiteReport } from "../../domain/reports/suite-report.js";

export interface HtmlReportRendererPort {
  renderSuiteReport(report: SuiteReport): string;
}
