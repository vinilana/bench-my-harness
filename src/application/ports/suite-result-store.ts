import type { SuiteReport, SuiteTrialReport } from "../../domain/reports/suite-report.js";

export interface SuiteResultStore {
  save(input: {
    runId: string;
    trials: readonly SuiteTrialReport[];
    report: SuiteReport;
  }): Promise<void>;

  findByRunId(runId: string): Promise<SuiteReport | undefined>;
}
