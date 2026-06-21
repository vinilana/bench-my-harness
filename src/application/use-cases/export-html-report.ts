import type { SuiteReport } from "../../domain/reports/suite-report.js";
import { renderSuiteReportHtml } from "../../domain/reports/suite-report.js";

export class ExportHtmlReportUseCase {
  public execute(report: SuiteReport): string {
    return renderSuiteReportHtml(report);
  }
}
