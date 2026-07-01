import type { HookInstallation } from "./install-harness-hooks-port.js";
import type { HarnessName, ProcessDiagnostics } from "./harness-runner-port.js";
import type { MetricObservation, UsageReport } from "./usage-capture-port.js";
import type { WorkspaceSourceProvenance } from "./workspace-provisioner-port.js";

interface BenchmarkPrompt {
  text?: string;
  file?: string;
}

interface BenchmarkCommandSource {
  setup_commands?: readonly string[];
  test_commands?: readonly string[];
}

interface BenchmarkRepoSource extends BenchmarkCommandSource {
  url?: string;
  base_ref?: string;
  golden_ref?: string;
}

export interface BenchmarkTrialDefinition {
  id: string;
  version: string;
  repo?: BenchmarkRepoSource;
  fixture?: BenchmarkCommandSource;
  prompt: BenchmarkPrompt;
  limits?: {
    timeout_seconds?: number;
  };
}

export interface RunTrialInput {
  benchmark: BenchmarkTrialDefinition;
  harness: HarnessName;
  runId: string;
  trialId: string;
  workspaceRoot: string;
  benchmarkRoot?: string;
  promptRoot?: string;
  strictTelemetry?: boolean;
}

export type TrialFailureClassification =
  | "agent_failed"
  | "environment_failed"
  | "timeout"
  | "budget_exceeded"
  | "adapter_failed"
  | "inconclusive";

export interface RunTrialResult {
  status: "completed" | "failed";
  failure_classification?: TrialFailureClassification;
  workspace: string;
  workspace_source?: WorkspaceSourceProvenance;
  process_diagnostics?: ProcessDiagnostics;
  hook_command?: HookInstallation["hookCommand"];
  hook_event_count?: number;
  metrics?: readonly MetricObservation[];
  usage?: UsageReport;
  notes?: readonly string[];
  artifact_paths?: {
    hook_spool_path?: string;
    transcript_path?: string;
    status_line_jsonl_path?: string;
    otel_jsonl_path?: string;
    diff_path?: string;
    test_output_path?: string;
  };
}

export interface BenchmarkTrialRunnerPort {
  runTrial(input: RunTrialInput): Promise<RunTrialResult>;
}
