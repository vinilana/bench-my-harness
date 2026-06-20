import { createHash } from "node:crypto";
import type { ArtifactKind, TrialArtifact } from "../../domain/artifacts/artifact.js";
import type { ArtifactReaderPort } from "../ports/artifact-reader-port.js";

export interface CollectTrialArtifactsInput {
  runId: string;
  trialId: string;
  workspace: string;
  transcriptPath?: string;
  diffPath?: string;
  testOutputPath?: string;
}

interface ArtifactCandidate {
  kind: ArtifactKind;
  path: string | undefined;
}

export interface CollectTrialArtifactsPorts {
  artifactReader: ArtifactReaderPort;
}

export async function collectTrialArtifacts(
  input: CollectTrialArtifactsInput,
  ports: CollectTrialArtifactsPorts
): Promise<TrialArtifact[]> {
  const candidates: ArtifactCandidate[] = [
    { kind: "transcript", path: input.transcriptPath },
    { kind: "diff", path: input.diffPath },
    { kind: "test_output", path: input.testOutputPath }
  ];

  const artifacts: TrialArtifact[] = [];

  for (const candidate of candidates) {
    if (!candidate.path) {
      continue;
    }

    const artifact = await ports.artifactReader.read({
      workspace: input.workspace,
      path: candidate.path
    });

    artifacts.push({
      run_id: input.runId,
      trial_id: input.trialId,
      kind: candidate.kind,
      path: artifact.path,
      content_hash: `sha256:${createHash("sha256").update(artifact.content).digest("hex")}`,
      size_bytes: artifact.sizeBytes
    });
  }

  return artifacts;
}
