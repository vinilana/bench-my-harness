import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import type {
  TrialTranscriptResolutionInput,
  TrialTranscriptResolutionResult,
  TrialTranscriptResolutionSource,
  TrialTranscriptResolverPort
} from "../../../application/ports/trial-transcript-resolver-port.js";

type UnknownRecord = Record<string, unknown>;

export class FilesystemProviderTranscriptResolver implements TrialTranscriptResolverPort {
  private readonly env: NodeJS.ProcessEnv;

  public constructor(options: { env?: NodeJS.ProcessEnv } = {}) {
    this.env = options.env ?? process.env;
  }

  public async resolve(input: TrialTranscriptResolutionInput): Promise<TrialTranscriptResolutionResult> {
    const candidates = await this.candidates(input);
    if (candidates.length === 0) {
      return unavailable("transcript path was not exposed");
    }

    let lastUnavailableReason = "transcript path was not exposed";

    for (const candidate of candidates) {
      const result = await this.resolveCandidate(candidate, input);
      if (result.transcriptPath !== undefined) {
        return result;
      }
      lastUnavailableReason = result.unavailableReason ?? lastUnavailableReason;

      if (candidate.source === "harness_result") {
        break;
      }
    }

    return unavailable(lastUnavailableReason);
  }

  private async resolveCandidate(
    candidate: {
      readonly path: string;
      readonly source: Exclude<TrialTranscriptResolutionSource, "unavailable">;
    },
    input: TrialTranscriptResolutionInput
  ): Promise<TrialTranscriptResolutionResult> {
    const resolvedPath = this.resolveCandidatePath(candidate.path, input.workspace);
    const pathValidation = this.validatePath(resolvedPath, candidate.source, input);
    if (pathValidation !== undefined) {
      return unavailable(pathValidation);
    }

    const text = await readableText(resolvedPath);
    if (text === undefined) {
      return unavailable("transcript file was not readable");
    }
    const records = parseJsonl(text);
    const workspaceValidation = validateWorkspace(records, input.workspace);
    if (workspaceValidation !== undefined) {
      return unavailable(workspaceValidation);
    }
    const timestampValidation = validateTimestamps(records, input.processDiagnostics);
    if (timestampValidation.status === "rejected") {
      return unavailable(timestampValidation.reason);
    }

    return {
      transcriptPath: resolvedPath,
      workspaceLocalTranscriptPath: input.workspace !== undefined && isInsideDirectory(input.workspace, resolvedPath)
        ? resolvedPath
        : undefined,
      source: candidate.source,
      confidence: timestampValidation.status === "accepted_high" ? "high" : "medium"
    };
  }

  private async candidates(input: TrialTranscriptResolutionInput): Promise<{
    readonly path: string;
    readonly source: Exclude<TrialTranscriptResolutionSource, "unavailable">;
  }[]> {
    if (input.harnessTranscriptPath !== undefined && input.harnessTranscriptPath.length > 0) {
      return [{ path: input.harnessTranscriptPath, source: "harness_result" }];
    }

    return (await transcriptPathsFromHookSpool(input.hookSpoolPath)).map((path) => ({
      path,
      source: "hook_spool" as const
    }));
  }

  private resolveCandidatePath(path: string, workspace: string | undefined): string {
    if (isAbsolute(path)) {
      return resolve(path);
    }

    return resolve(workspace ?? process.cwd(), path);
  }

  private validatePath(
    path: string,
    source: Exclude<TrialTranscriptResolutionSource, "unavailable">,
    input: TrialTranscriptResolutionInput
  ): string | undefined {
    if (input.workspace !== undefined && isInsideDirectory(input.workspace, path)) {
      return undefined;
    }

    if (source === "hook_spool" || source === "harness_result") {
      return this.approvedProviderRoots(input.harness).some((root) => isInsideDirectory(root, path))
        ? undefined
        : "transcript path was outside approved provider roots";
    }

    return "transcript path was outside approved provider roots";
  }

  private approvedProviderRoots(harness: TrialTranscriptResolutionInput["harness"]): string[] {
    return harness === "codex" ? this.codexRoots() : this.claudeRoots();
  }

  private codexRoots(): string[] {
    const codexHome = this.env.CODEX_HOME ?? join(this.home(), ".codex");
    return [resolve(codexHome, "sessions")];
  }

  private claudeRoots(): string[] {
    const configured = this.env.CLAUDE_CONFIG_DIR;
    const configRoots = configured === undefined || configured.length === 0
      ? [join(this.home(), ".claude")]
      : configured.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);

    return configRoots.map((entry) => {
      const resolved = resolve(entry);
      return basename(resolved) === "projects"
        ? resolved
        : join(resolved, "projects");
    });
  }

  private home(): string {
    return this.env.HOME ?? homedir();
  }
}

async function transcriptPathsFromHookSpool(hookSpoolPath: string | undefined): Promise<string[]> {
  if (hookSpoolPath === undefined) {
    return [];
  }

  try {
    const lines = (await readFile(hookSpoolPath, "utf8")).split(/\r?\n/).filter((line) => line.trim().length > 0);
    const transcriptPaths = new Set<string>();

    for (const line of lines) {
      const parsed = JSON.parse(line) as unknown;
      if (!isRecord(parsed)) {
        continue;
      }

      const transcriptPath = stringValue(parsed, "transcript_path")
        ?? stringValue(parsed, "transcriptPath")
        ?? nestedString(parsed, ["payload", "transcript_path"])
        ?? nestedString(parsed, ["payload", "transcriptPath"]);
      if (transcriptPath !== undefined) {
        transcriptPaths.add(transcriptPath);
      }
    }

    return [...transcriptPaths];
  } catch {
    return [];
  }
}

async function readableText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function parseJsonl(text: string): UnknownRecord[] {
  const records: UnknownRecord[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        records.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return records;
}

function validateWorkspace(records: readonly UnknownRecord[], workspace: string | undefined): string | undefined {
  if (workspace === undefined) {
    return undefined;
  }

  const candidates = records.flatMap(workspaceCandidates);
  if (candidates.length === 0) {
    return undefined;
  }

  return candidates.every((candidate) => pathsEqual(candidate, workspace))
    ? undefined
    : "transcript workspace did not match trial workspace";
}

function workspaceCandidates(record: UnknownRecord): string[] {
  return [
    stringValue(record, "cwd"),
    stringValue(record, "workspace"),
    nestedString(record, ["payload", "cwd"]),
    nestedString(record, ["payload", "workspace"]),
    nestedString(record, ["data", "message", "cwd"]),
    nestedString(record, ["data", "message", "workspace"])
  ].filter((value): value is string => value !== undefined);
}

function validateTimestamps(
  records: readonly UnknownRecord[],
  diagnostics: TrialTranscriptResolutionInput["processDiagnostics"]
): { readonly status: "accepted_high" | "accepted_medium" } | { readonly status: "rejected"; readonly reason: string } {
  if (diagnostics === undefined) {
    return { status: "accepted_medium" };
  }

  const timestamps = records.flatMap(timestampCandidates).map(Date.parse).filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) {
    return { status: "accepted_medium" };
  }

  const started = Date.parse(diagnostics.exit.started_at);
  const ended = Date.parse(diagnostics.exit.ended_at);
  if (!Number.isFinite(started) || !Number.isFinite(ended)) {
    return { status: "accepted_medium" };
  }

  return timestamps.some((timestamp) => timestamp >= started && timestamp <= ended)
    ? { status: "accepted_high" }
    : { status: "rejected", reason: "transcript timestamps did not overlap process execution" };
}

function timestampCandidates(record: UnknownRecord): string[] {
  return [
    stringValue(record, "timestamp"),
    stringValue(record, "created_at"),
    stringValue(record, "occurred_at"),
    nestedString(record, ["payload", "timestamp"]),
    nestedString(record, ["payload", "created_at"]),
    nestedString(record, ["payload", "occurred_at"]),
    nestedString(record, ["data", "message", "timestamp"])
  ].filter((value): value is string => value !== undefined);
}

function unavailable(reason: string): TrialTranscriptResolutionResult {
  return {
    source: "unavailable",
    confidence: "none",
    unavailableReason: reason
  };
}

function stringValue(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nestedString(record: UnknownRecord, keys: readonly string[]): string | undefined {
  let current: unknown = record;

  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }

  return typeof current === "string" && current.length > 0 ? current : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInsideDirectory(directory: string, path: string): boolean {
  const relativePath = relative(resolve(directory), resolve(path));
  return relativePath.length === 0 || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function pathsEqual(first: string, second: string): boolean {
  return resolve(first) === resolve(second);
}
