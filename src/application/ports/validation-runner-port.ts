import type { HarnessName } from "./harness-runner-port.js";

export type ValidationCommandPhase = "setup" | "validation";

export interface ValidationRunnerInput {
  runId: string;
  trialId: string;
  harness: HarnessName;
  workspace: string;
  setupCommands: readonly string[];
  validationCommands: readonly string[];
  timeoutSeconds?: number;
}

export interface ValidationRunnerResult {
  status: "passed" | "failed";
  failedPhase?: ValidationCommandPhase;
  exitCode?: number;
  testOutputPath?: string;
}

export interface ValidationRunnerPort {
  execute(input: ValidationRunnerInput): Promise<ValidationRunnerResult>;
}
