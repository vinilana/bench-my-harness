import type { BenchmarkReportRendererPort } from "../ports/benchmark-report-renderer-port.js";
import { redactSecrets } from "../../domain/security/redact-secrets.js";
import type { BenchmarkReport, ReportFormat } from "../../domain/reports/report-model.js";

export interface ExportReportInput {
  readonly format: ReportFormat;
  readonly report: BenchmarkReport;
  readonly includeRawPayloads?: boolean;
}

export class ExportReportUseCase {
  public constructor(private readonly renderer: BenchmarkReportRendererPort) {}

  public execute(input: ExportReportInput): string {
    return this.renderer.renderBenchmarkReport({
      format: input.format,
      report: sanitizeReport(input.report, input.includeRawPayloads ?? false)
    });
  }
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
