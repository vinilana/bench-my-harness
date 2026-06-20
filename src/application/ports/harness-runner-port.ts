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

export interface HarnessRunnerResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  transcriptPath?: string;
  diffPath?: string;
  testOutputPath?: string;
}

export interface HarnessRunnerPort {
  execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult>;
}
