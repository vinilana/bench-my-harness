export type ArtifactKind = "transcript" | "diff" | "test_output" | "artifact";

export interface TrialArtifact {
  run_id: string;
  trial_id: string;
  kind: ArtifactKind;
  path: string;
  content_hash: `sha256:${string}`;
  size_bytes: number;
}
