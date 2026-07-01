import type { HarnessName } from "./harness-runner-port.js";
import type { ProcessDiagnostics } from "./harness-runner-port.js";
import type { UsageReport } from "./usage-capture-port.js";

export interface TrialArtifactFinalizationInput {
  readonly runId: string;
  readonly specId: string;
  readonly harness: HarnessName;
  readonly trialId: string;
  readonly workspace?: string;
  readonly hookSpoolPath?: string;
  readonly transcriptPath?: string;
  readonly statusLineJsonlPath?: string;
  readonly otelJsonlPath?: string;
  readonly diffPath?: string;
  readonly testOutputPath?: string;
  readonly processDiagnostics?: ProcessDiagnostics;
  readonly usage?: UsageReport;
  readonly strictTelemetry?: boolean;
}

export interface ArtifactIndexEntry {
  readonly ref: string;
  readonly exists: boolean;
  readonly kind: string;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly capture_source?: string;
  readonly confidence?: string;
  readonly redaction?: {
    readonly status: "applied" | "not_needed";
    readonly raw_payloads_included: false;
    readonly original_payload_hash?: string;
    readonly redaction_hashes?: readonly string[];
  };
  readonly unavailable_reason?: string;
}

export interface TrialArtifactFinalizationResult {
  readonly artifactRefs: readonly string[];
  readonly artifactIndex: readonly ArtifactIndexEntry[];
}

export interface ArtifactFinalizerPort {
  finalize(input: TrialArtifactFinalizationInput): Promise<TrialArtifactFinalizationResult>;
}
