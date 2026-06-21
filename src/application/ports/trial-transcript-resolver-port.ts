import type { HarnessName, ProcessDiagnostics } from "./harness-runner-port.js";
import type { MeasurementConfidence } from "./usage-capture-port.js";

export type TrialTranscriptResolutionSource = "harness_result" | "hook_spool" | "unavailable";

export interface TrialTranscriptResolutionInput {
  readonly harness: HarnessName;
  readonly runId: string;
  readonly trialId: string;
  readonly workspace?: string;
  readonly hookSpoolPath?: string;
  readonly harnessTranscriptPath?: string;
  readonly processDiagnostics?: ProcessDiagnostics;
}

export interface TrialTranscriptResolutionResult {
  readonly transcriptPath?: string;
  readonly workspaceLocalTranscriptPath?: string;
  readonly source: TrialTranscriptResolutionSource;
  readonly confidence: MeasurementConfidence;
  readonly unavailableReason?: string;
}

export interface TrialTranscriptResolverPort {
  resolve(input: TrialTranscriptResolutionInput): Promise<TrialTranscriptResolutionResult>;
}
