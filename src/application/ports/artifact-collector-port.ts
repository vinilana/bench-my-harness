import type { TrialArtifact } from "../../domain/artifacts/artifact.js";

export interface ArtifactCollectorInput {
  runId: string;
  trialId: string;
  workspace: string;
  transcriptPath?: string;
  diffPath?: string;
  testOutputPath?: string;
}

export interface ArtifactCollectorPort {
  collect(input: ArtifactCollectorInput): Promise<TrialArtifact[]>;
}
