import type { SuiteReport, SuiteTrialReport } from "../../domain/reports/suite-report.js";
import type { HarnessName, ProcessDiagnostics } from "./harness-runner-port.js";

export interface TrialProcessDiagnosticsRecord {
  spec_id: string;
  harness: HarnessName;
  trial_id: string;
  diagnostics: ProcessDiagnostics;
}

export interface SuiteResultStore {
  save(input: {
    runId: string;
    trials: readonly SuiteTrialReport[];
    report: SuiteReport;
    processDiagnostics?: readonly TrialProcessDiagnosticsRecord[];
  }): Promise<void>;

  findByRunId(runId: string): Promise<SuiteReport | undefined>;
}
