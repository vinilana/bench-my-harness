import type {
  ArtifactListFilter,
  ArtifactStore,
  StoredArtifact
} from "../../../application/ports/artifact-store.js";

export class InMemoryArtifactStore implements ArtifactStore {
  private readonly recordsByIdempotencyKey = new Map<string, StoredArtifact>();

  async append(input: StoredArtifact): Promise<StoredArtifact> {
    const idempotencyKey = toArtifactIdempotencyKey(input);
    const existing = this.recordsByIdempotencyKey.get(idempotencyKey);

    if (existing !== undefined) {
      return cloneArtifact(existing);
    }

    const stored = cloneArtifact(input);
    this.recordsByIdempotencyKey.set(idempotencyKey, stored);

    return cloneArtifact(stored);
  }

  async count(): Promise<number> {
    return this.recordsByIdempotencyKey.size;
  }

  async list(filter: ArtifactListFilter = {}): Promise<StoredArtifact[]> {
    return Array.from(this.recordsByIdempotencyKey.values())
      .filter((artifact) => matchesArtifactFilter(artifact, filter))
      .map((artifact) => cloneArtifact(artifact));
  }
}

function toArtifactIdempotencyKey(artifact: StoredArtifact): string {
  return [artifact.run_id, artifact.trial_id, artifact.kind, artifact.content_hash].join(":");
}

function matchesArtifactFilter(artifact: StoredArtifact, filter: ArtifactListFilter): boolean {
  return (
    (filter.run_id === undefined || artifact.run_id === filter.run_id) &&
    (filter.trial_id === undefined || artifact.trial_id === filter.trial_id) &&
    (filter.kind === undefined || artifact.kind === filter.kind) &&
    (filter.content_hash === undefined || artifact.content_hash === filter.content_hash)
  );
}

function cloneArtifact(artifact: StoredArtifact): StoredArtifact {
  return JSON.parse(JSON.stringify(artifact)) as StoredArtifact;
}
