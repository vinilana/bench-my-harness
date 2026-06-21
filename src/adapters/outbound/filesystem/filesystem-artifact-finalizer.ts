import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type {
  ArtifactFinalizerPort,
  ArtifactIndexEntry,
  TrialArtifactFinalizationInput,
  TrialArtifactFinalizationResult
} from "../../../application/ports/artifact-finalizer-port.js";

interface ArtifactCandidate {
  readonly ref: string;
  readonly kind: string;
  readonly sourcePath?: string;
  readonly unavailableReason: string;
}

export class FilesystemArtifactFinalizer implements ArtifactFinalizerPort {
  public constructor(private readonly options: { root: string }) {}

  public async finalize(input: TrialArtifactFinalizationInput): Promise<TrialArtifactFinalizationResult> {
    const trialDir = this.trialDir(input);
    await mkdir(trialDir, { recursive: true });
    await this.writeProcessDiagnostics(trialDir, input);
    await this.writeUsage(trialDir, input);
    const transcriptPath = input.transcriptPath ?? await transcriptPathFromHookSpool(input.hookSpoolPath);

    const candidates: readonly ArtifactCandidate[] = [
      {
        ref: "process-stdout.txt",
        kind: "process_stdout",
        sourcePath: input.processDiagnostics === undefined ? undefined : join(trialDir, "process-stdout.txt"),
        unavailableReason: "process stdout was not captured"
      },
      {
        ref: "process-stderr.txt",
        kind: "process_stderr",
        sourcePath: input.processDiagnostics === undefined ? undefined : join(trialDir, "process-stderr.txt"),
        unavailableReason: "process stderr was not captured"
      },
      {
        ref: "process-exit.json",
        kind: "process_exit",
        sourcePath: input.processDiagnostics === undefined ? undefined : join(trialDir, "process-exit.json"),
        unavailableReason: "process exit diagnostics were not captured"
      },
      {
        ref: "hooks.jsonl",
        kind: "hook_spool",
        sourcePath: input.hookSpoolPath,
        unavailableReason: "hook spool was not found"
      },
      {
        ref: "transcript.jsonl",
        kind: "transcript",
        sourcePath: resolveWorkspacePath(input.workspace, transcriptPath),
        unavailableReason: "transcript path was not exposed"
      },
      {
        ref: "diff.patch",
        kind: "diff",
        sourcePath: resolveWorkspacePath(input.workspace, input.diffPath),
        unavailableReason: "git diff was not generated"
      },
      {
        ref: "test-output.txt",
        kind: "test_output",
        sourcePath: resolveWorkspacePath(input.workspace, input.testOutputPath),
        unavailableReason: "validation commands did not produce test output"
      },
      {
        ref: "usage.json",
        kind: "usage",
        sourcePath: input.usage === undefined ? undefined : join(trialDir, "usage.json"),
        unavailableReason: "usage capture did not run"
      }
    ];

    const artifactIndex: ArtifactIndexEntry[] = [];
    const artifactRefs: string[] = [];

    for (const candidate of candidates) {
      const entry = await this.materializeCandidate(trialDir, candidate, input.strictTelemetry ?? false);
      artifactIndex.push(entry);

      if (entry.exists) {
        artifactRefs.push(this.runRelativeRef(input, candidate.ref));
      }
    }

    await writeFile(
      join(trialDir, "artifact-index.json"),
      `${JSON.stringify({ artifacts: artifactIndex }, null, 2)}\n`,
      "utf8"
    );

    artifactRefs.push(this.runRelativeRef(input, "artifact-index.json"));

    return {
      artifactRefs,
      artifactIndex
    };
  }

  private async materializeCandidate(
    trialDir: string,
    candidate: ArtifactCandidate,
    strictTelemetry: boolean
  ): Promise<ArtifactIndexEntry> {
    if (candidate.sourcePath === undefined) {
      return missingEntry(candidate);
    }

    const destination = join(trialDir, candidate.ref);
    const source = resolve(candidate.sourcePath);

    try {
      if (source !== resolve(destination)) {
        await copyFile(source, destination);
      }

      return existingEntry(candidate, destination);
    } catch (error) {
      if (strictTelemetry) {
        throw new Error(`artifact ${candidate.ref} could not be finalized: ${errorMessage(error)}`);
      }

      return missingEntry(candidate);
    }
  }

  private trialDir(input: TrialArtifactFinalizationInput): string {
    return join(this.options.root, input.runId, "specs", input.specId, input.harness, input.trialId);
  }

  private runRelativeRef(input: TrialArtifactFinalizationInput, ref: string): string {
    return join("specs", input.specId, input.harness, input.trialId, ref);
  }

  private async writeProcessDiagnostics(
    trialDir: string,
    input: TrialArtifactFinalizationInput
  ): Promise<void> {
    if (input.processDiagnostics === undefined) {
      return;
    }

    await writeFile(join(trialDir, "process-stdout.txt"), input.processDiagnostics.stdout, "utf8");
    await writeFile(join(trialDir, "process-stderr.txt"), input.processDiagnostics.stderr, "utf8");
    await writeFile(
      join(trialDir, "process-exit.json"),
      `${JSON.stringify(input.processDiagnostics.exit, null, 2)}\n`,
      "utf8"
    );
  }

  private async writeUsage(trialDir: string, input: TrialArtifactFinalizationInput): Promise<void> {
    if (input.usage === undefined) {
      return;
    }

    await writeFile(join(trialDir, "usage.json"), `${JSON.stringify(input.usage, null, 2)}\n`, "utf8");
  }
}

async function existingEntry(candidate: ArtifactCandidate, path: string): Promise<ArtifactIndexEntry> {
  const [metadata, content] = await Promise.all([stat(path), readFile(path)]);

  return {
    ref: candidate.ref,
    exists: true,
    bytes: metadata.size,
    sha256: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    kind: candidate.kind
  };
}

function missingEntry(candidate: ArtifactCandidate): ArtifactIndexEntry {
  return {
    ref: candidate.ref,
    exists: false,
    kind: candidate.kind,
    unavailable_reason: candidate.unavailableReason
  };
}

function resolveWorkspacePath(workspace: string | undefined, path: string | undefined): string | undefined {
  if (path === undefined) {
    return undefined;
  }

  if (workspace === undefined) {
    return path;
  }

  const resolvedWorkspace = resolve(workspace);
  const resolvedPath = isAbsolute(path) ? resolve(path) : resolve(workspace, path);

  if (!isInsideDirectory(resolvedWorkspace, resolvedPath)) {
    return undefined;
  }

  return resolvedPath;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isInsideDirectory(directory: string, path: string): boolean {
  const relativePath = relative(directory, path);
  return relativePath.length === 0 || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

async function transcriptPathFromHookSpool(hookSpoolPath: string | undefined): Promise<string | undefined> {
  if (hookSpoolPath === undefined) {
    return undefined;
  }

  try {
    const lines = (await readFile(hookSpoolPath, "utf8")).split("\n").filter((line) => line.trim().length > 0);

    for (const line of lines) {
      const parsed = JSON.parse(line) as {
        transcript_path?: unknown;
        transcriptPath?: unknown;
        payload?: {
          transcript_path?: unknown;
          transcriptPath?: unknown;
        };
      };
      const transcriptPath = parsed.transcript_path
        ?? parsed.transcriptPath
        ?? parsed.payload?.transcript_path
        ?? parsed.payload?.transcriptPath;

      if (typeof transcriptPath === "string" && transcriptPath.length > 0) {
        return transcriptPath;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}
