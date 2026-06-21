import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import type { HarnessName } from "../../../application/ports/harness-runner-port.js";
import type { HarnessCommand } from "../../../domain/harnesses/harness-profile.js";

export type HarnessCommandProfileStatus = "supported" | "unsupported";
export type HarnessExecutableAvailabilityReason = "available" | "not_found";

export interface HarnessCommandProfile {
  readonly harness: HarnessName;
  readonly capabilityStatus: HarnessCommandProfileStatus;
  readonly command?: HarnessCommand;
  readonly reason?: string;
}

export interface HarnessExecutableAvailability {
  readonly available: boolean;
  readonly executable: string;
  readonly resolvedPath?: string;
  readonly reason: HarnessExecutableAvailabilityReason;
  readonly message: string;
}

export function getBuiltInHarnessCommandProfile(harness: HarnessName): HarnessCommandProfile {
  if (harness === "codex") {
    return {
      harness,
      capabilityStatus: "supported",
      command: {
        executable: "codex",
        args: [
          "exec",
          "--skip-git-repo-check",
          "--sandbox",
          "workspace-write",
          "--dangerously-bypass-hook-trust",
          "-"
        ],
        promptDelivery: "stdin"
      }
    };
  }

  return {
    harness,
    capabilityStatus: "unsupported",
    reason: "Claude Code real process command profile is not implemented for this CLI build"
  };
}

export async function checkHarnessCommandAvailability(
  command: Pick<HarnessCommand, "executable">,
  env: NodeJS.ProcessEnv = process.env
): Promise<HarnessExecutableAvailability> {
  const resolvedPath = await resolveExecutable(command.executable, env);

  if (resolvedPath !== undefined) {
    return {
      available: true,
      executable: command.executable,
      resolvedPath,
      reason: "available",
      message: `harness executable available: ${command.executable} (${resolvedPath})`
    };
  }

  return {
    available: false,
    executable: command.executable,
    reason: "not_found",
    message: `harness executable not found on PATH: ${command.executable}`
  };
}

async function resolveExecutable(executable: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  if (executable.includes("/") || isAbsolute(executable)) {
    return (await isExecutable(executable)) ? executable : undefined;
  }

  const pathValue = env.PATH ?? "";
  const pathEntries = pathValue.split(delimiter).filter((entry) => entry.length > 0);

  for (const pathEntry of pathEntries) {
    const candidate = join(pathEntry, executable);

    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
