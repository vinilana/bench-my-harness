import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ArtifactKind, TrialArtifact } from "../../domain/artifacts/artifact.js";

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

export async function collectTrialArtifacts(input: CollectTrialArtifactsInput): Promise<TrialArtifact[]> {
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

    const artifactPath = assertInsideWorkspace(input.workspace, candidate.path);
    const [content, fileStat] = await Promise.all([readFile(artifactPath), stat(artifactPath)]);

    artifacts.push({
      run_id: input.runId,
      trial_id: input.trialId,
      kind: candidate.kind,
      path: artifactPath,
      content_hash: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      size_bytes: fileStat.size
    });
  }

  return artifacts;
}

function assertInsideWorkspace(workspace: string, candidatePath: string): string {
  const workspacePath = resolve(workspace);
  const artifactPath = isAbsolute(candidatePath) ? resolve(candidatePath) : resolve(workspacePath, candidatePath);
  const relativePath = relative(workspacePath, artifactPath);

  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Artifact path is outside workspace: ${candidatePath}`);
  }

  return artifactPath;
}
