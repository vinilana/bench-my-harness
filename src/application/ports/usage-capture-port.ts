export type UsageProvider = "codex" | "claude_code";

export type MeasurementSource =
  | "native"
  | "observed"
  | "derived"
  | "estimated"
  | "unavailable";

export type MeasurementConfidence = "high" | "medium" | "low" | "none";

export interface UsageCaptureContext {
  readonly provider: UsageProvider;
  readonly runId: string;
  readonly trialId: string;
}

export interface MetricObservation {
  readonly metric: string;
  readonly value?: number | null;
  readonly unit?: string;
  readonly measurement_source: MeasurementSource;
  readonly capture_source: string;
  readonly confidence: MeasurementConfidence;
}

export interface UsageCapturePort {
  capture(context: UsageCaptureContext): Promise<readonly MetricObservation[]>;
}
