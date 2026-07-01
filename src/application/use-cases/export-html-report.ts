import type { SuiteReport } from "../../domain/reports/suite-report.js";
import type { HtmlReportRendererPort } from "../ports/html-report-renderer-port.js";

export class ExportHtmlReportUseCase {
  public constructor(private readonly renderer: HtmlReportRendererPort) {}

  public execute(report: SuiteReport): string {
    return this.renderer.renderSuiteReport(report);
  }
}
