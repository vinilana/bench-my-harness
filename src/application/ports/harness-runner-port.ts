export type HarnessName = "codex" | "claude_code";

export interface HarnessRunnerInput {
  harness: HarnessName;
  prompt: string;
  workspace: string;
  runId: string;
  trialId: string;
  env: Record<string, string>;
  timeoutSeconds?: number;
}

export type HarnessFailureClassification =
  | "agent_failed"
  | "environment_failed"
  | "timeout"
  | "budget_exceeded"
  | "adapter_failed"
  | "inconclusive";

export interface ProcessExitDiagnostics {
  executable: string;
  args: readonly string[];
  exit_code: number;
  timed_out: boolean;
  started_at: string;
  ended_at: string;
  duration_ms: number;
}

export interface ProcessDiagnostics {
  stdout: string;
  stderr: string;
  exit: ProcessExitDiagnostics;
}

export interface HarnessRunnerResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  failureClassification?: HarnessFailureClassification;
  processDiagnostics?: ProcessDiagnostics;
  transcriptPath?: string;
  statusLineJsonlPath?: string;
  otelJsonlPath?: string;
  diffPath?: string;
  testOutputPath?: string;
}

export interface HarnessRunnerPort {
  execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult>;
}
