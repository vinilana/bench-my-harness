import type { SuiteReport, SuiteTrialReport } from "../../domain/reports/suite-report.js";
import type { HarnessName, ProcessDiagnostics } from "./harness-runner-port.js";
import type { UsageReport } from "./usage-capture-port.js";

export interface TrialArtifactFinalizationRecord {
  spec_id: string;
  harness: HarnessName;
  trial_id: string;
  workspace?: string;
  hook_spool_path?: string;
  transcript_path?: string;
  status_line_jsonl_path?: string;
  otel_jsonl_path?: string;
  diff_path?: string;
  test_output_path?: string;
  process_diagnostics?: ProcessDiagnostics;
  usage?: UsageReport;
  strict_telemetry?: boolean;
}

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
    artifactFinalizations?: readonly TrialArtifactFinalizationRecord[];
  }): Promise<void>;

  findByRunId(runId: string): Promise<SuiteReport | undefined>;
}
