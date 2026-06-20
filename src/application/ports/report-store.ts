import type { BenchmarkReport } from "../../domain/reports/report-model.js";

export type ReportState = Omit<BenchmarkReport, "metrics" | "raw_payloads">;

export interface ReportStore {
  save(input: ReportState): Promise<ReportState>;
  findByRunId(runId: string): Promise<ReportState | undefined>;
}
