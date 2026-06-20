import type { ArtifactKind, TrialArtifact } from "../../domain/artifacts/artifact.js";

export interface StoredArtifact extends TrialArtifact {
  content?: string;
}

export interface ArtifactListFilter {
  run_id?: string;
  trial_id?: string;
  kind?: ArtifactKind;
  content_hash?: string;
}

export interface ArtifactStore {
  append(input: StoredArtifact): Promise<StoredArtifact>;
  count(): Promise<number>;
  list(filter?: ArtifactListFilter): Promise<StoredArtifact[]>;
}
