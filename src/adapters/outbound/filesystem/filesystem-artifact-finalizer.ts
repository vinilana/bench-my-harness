import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type {
  ArtifactFinalizerPort,
  ArtifactIndexEntry,
  TrialArtifactFinalizationInput,
  TrialArtifactFinalizationResult
} from "../../../application/ports/artifact-finalizer-port.js";
import type { TrialTranscriptResolverPort } from "../../../application/ports/trial-transcript-resolver-port.js";
import { redactSecrets } from "../../../domain/security/redact-secrets.js";
import { FilesystemProviderTranscriptResolver } from "./filesystem-provider-transcript-resolver.js";
import { safePathSegment } from "./path-safety.js";

interface ArtifactCandidate {
  readonly ref: string;
  readonly kind: string;
  readonly content?: string;
  readonly sourcePath?: string;
  readonly unavailableReason: string;
  readonly requiredWhenStrict?: boolean;
  readonly captureSource?: string;
  readonly confidence?: string;
  readonly redactBeforeWrite?: boolean;
}

export class FilesystemArtifactFinalizer implements ArtifactFinalizerPort {
  private readonly transcriptResolver: TrialTranscriptResolverPort;

  public constructor(private readonly options: { root: string; transcriptResolver?: TrialTranscriptResolverPort }) {
    this.transcriptResolver = options.transcriptResolver ?? new FilesystemProviderTranscriptResolver();
  }

  public async finalize(input: TrialArtifactFinalizationInput): Promise<TrialArtifactFinalizationResult> {
    const trialDir = this.trialDir(input);
    await mkdir(trialDir, { recursive: true });
    const transcriptResolution = await this.transcriptResolver.resolve({
      harness: input.harness,
      runId: input.runId,
      trialId: input.trialId,
      workspace: input.workspace,
      hookSpoolPath: input.hookSpoolPath,
      harnessTranscriptPath: input.transcriptPath,
      processDiagnostics: input.processDiagnostics
    });

    const candidates: readonly ArtifactCandidate[] = [
      {
        ref: "process-stdout.txt",
        kind: "process_stdout",
        content: input.processDiagnostics?.stdout,
        unavailableReason: "process stdout was not captured",
        redactBeforeWrite: true
      },
      {
        ref: "process-stderr.txt",
        kind: "process_stderr",
        content: input.processDiagnostics?.stderr,
        unavailableReason: "process stderr was not captured",
        redactBeforeWrite: true
      },
      {
        ref: "process-exit.json",
        kind: "process_exit",
        content: input.processDiagnostics === undefined
          ? undefined
          : `${JSON.stringify(input.processDiagnostics.exit, null, 2)}\n`,
        unavailableReason: "process exit diagnostics were not captured",
        redactBeforeWrite: true
      },
      {
        ref: "hooks.jsonl",
        kind: "hook_spool",
        sourcePath: input.hookSpoolPath,
        unavailableReason: "hook spool was not found",
        requiredWhenStrict: true,
        redactBeforeWrite: true
      },
      {
        ref: "transcript.jsonl",
        kind: "transcript",
        sourcePath: transcriptResolution.transcriptPath,
        unavailableReason: transcriptResolution.unavailableReason ?? "transcript path was not exposed",
        requiredWhenStrict: true,
        captureSource: transcriptResolution.source,
        confidence: transcriptResolution.confidence,
        redactBeforeWrite: true
      },
      {
        ref: "status-line.jsonl",
        kind: "status_line",
        sourcePath: resolveWorkspacePath(input.workspace, input.statusLineJsonlPath),
        unavailableReason: "status-line evidence was not captured",
        redactBeforeWrite: true
      },
      {
        ref: "otel.jsonl",
        kind: "otel_telemetry",
        sourcePath: resolveWorkspacePath(input.workspace, input.otelJsonlPath),
        unavailableReason: "OpenTelemetry evidence was not captured",
        redactBeforeWrite: true
      },
      {
        ref: "diff.patch",
        kind: "diff",
        sourcePath: resolveWorkspacePath(input.workspace, input.diffPath),
        unavailableReason: "git diff was not generated",
        redactBeforeWrite: true
      },
      {
        ref: "test-output.txt",
        kind: "test_output",
        sourcePath: resolveWorkspacePath(input.workspace, input.testOutputPath),
        unavailableReason: "validation commands did not produce test output",
        redactBeforeWrite: true
      },
      {
        ref: "usage.json",
        kind: "usage",
        content: input.usage === undefined ? undefined : `${JSON.stringify(input.usage, null, 2)}\n`,
        unavailableReason: "usage capture did not run",
        redactBeforeWrite: true
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
    const sourcePath = candidate.sourcePath;

    if (sourcePath === undefined && candidate.content === undefined) {
      if (strictTelemetry && candidate.requiredWhenStrict === true) {
        throw new Error(`artifact ${candidate.ref} could not be finalized: ${candidate.unavailableReason}`);
      }

      return missingEntry(candidate);
    }

    const destination = join(trialDir, candidate.ref);

    try {
      if (candidate.content !== undefined) {
        const redaction = candidate.redactBeforeWrite === true ? redactSecrets(candidate.content) : undefined;
        await writeFile(destination, redaction?.redacted ?? candidate.content, "utf8");
        return existingEntry(candidate, destination, redaction);
      }

      if (sourcePath === undefined) {
        return missingEntry(candidate);
      }

      const source = resolve(sourcePath);

      if (candidate.redactBeforeWrite === true) {
        const content = await readFile(source, "utf8");
        const redaction = redactSecrets(content);
        await writeFile(destination, redaction.redacted, "utf8");
        return existingEntry(candidate, destination, redaction);
      }

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
    return join(
      this.options.root,
      safePathSegment(input.runId, "run id"),
      "specs",
      safePathSegment(input.specId, "spec id"),
      safePathSegment(input.harness, "harness"),
      safePathSegment(input.trialId, "trial id")
    );
  }

  private runRelativeRef(input: TrialArtifactFinalizationInput, ref: string): string {
    return join(
      "specs",
      safePathSegment(input.specId, "spec id"),
      safePathSegment(input.harness, "harness"),
      safePathSegment(input.trialId, "trial id"),
      ref
    );
  }
}

async function existingEntry(
  candidate: ArtifactCandidate,
  path: string,
  redaction?: ReturnType<typeof redactSecrets>
): Promise<ArtifactIndexEntry> {
  const [metadata, content] = await Promise.all([stat(path), readFile(path)]);

  return {
    ref: candidate.ref,
    exists: true,
    bytes: metadata.size,
    sha256: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    kind: candidate.kind,
    capture_source: candidate.captureSource,
    confidence: candidate.confidence,
    redaction: redaction === undefined
      ? undefined
      : {
          status: redaction.redactionApplied ? "applied" : "not_needed",
          raw_payloads_included: false,
          original_payload_hash: redaction.originalHash,
          redaction_hashes: redaction.findings.map((finding) => finding.hash)
        }
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
