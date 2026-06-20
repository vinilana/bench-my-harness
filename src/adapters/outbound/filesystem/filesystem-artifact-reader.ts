import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ArtifactReaderPort,
  ReadArtifactInput,
  ReadArtifactResult
} from "../../../application/ports/artifact-reader-port.js";

export class FilesystemArtifactReader implements ArtifactReaderPort {
  public async read(input: ReadArtifactInput): Promise<ReadArtifactResult> {
    const artifactPath = assertInsideWorkspace(input.workspace, input.path);
    const [content, fileStat] = await Promise.all([readFile(artifactPath), stat(artifactPath)]);

    return {
      path: artifactPath,
      content,
      sizeBytes: fileStat.size
    };
  }
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
