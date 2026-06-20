export interface ReadArtifactInput {
  workspace: string;
  path: string;
}

export interface ReadArtifactResult {
  path: string;
  content: Uint8Array;
  sizeBytes: number;
}

export interface ArtifactReaderPort {
  read(input: ReadArtifactInput): Promise<ReadArtifactResult>;
}
