import {
  serializeReport,
  type ExportReportInput
} from "../../domain/reports/export-report.js";

export function exportReport(input: ExportReportInput): string {
  return serializeReport(input);
}
