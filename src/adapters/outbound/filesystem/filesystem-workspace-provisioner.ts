import { spawn } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  ProvisionedWorkspace,
  ProvisionWorkspaceInput,
  WorkspaceProvisionerPort
} from "../../../application/ports/workspace-provisioner-port.js";

export class FilesystemWorkspaceProvisioner implements WorkspaceProvisionerPort {
  public async provision(input: ProvisionWorkspaceInput): Promise<ProvisionedWorkspace> {
    const workspace = workspacePath(input.workspaceRoot, input.trialId);
    const spoolPath = join(workspace, ".bmh", "hooks.jsonl");

    if (input.source?.type === "git") {
      const repoPath = localRepoPath(input.source.repoUrl);

      try {
        await mkdir(dirname(workspace), { recursive: true });
        await assertWorkspaceDoesNotExist(workspace);
        await runGit(["clone", "--no-checkout", repoPath, workspace]);
        await runGit(["checkout", "--detach", input.source.baseRef], workspace);
        const resolvedBaseSha = await runGit(["rev-parse", "HEAD"], workspace);
        const resolvedGoldenSha = input.source.goldenRef === undefined
          ? undefined
          : await optionalGit(["rev-parse", input.source.goldenRef], workspace);
        await mkdir(dirname(spoolPath), { recursive: true });

        return {
          workspace,
          spoolPath,
          workspaceSource: {
            type: "git",
            repo_url: input.source.repoUrl,
            base_ref: input.source.baseRef,
            resolved_base_sha: resolvedBaseSha.trim(),
            golden_ref: input.source.goldenRef,
            resolved_golden_sha: resolvedGoldenSha?.trim()
          }
        };
      } catch (error) {
        await rm(workspace, { recursive: true, force: true });
        throw error;
      }
    }

    await mkdir(dirname(workspace), { recursive: true });
    await assertWorkspaceDoesNotExist(workspace);
    await mkdir(dirname(spoolPath), { recursive: true });

    return { workspace, spoolPath };
  }
}

function workspacePath(workspaceRoot: string, trialId: string): string {
  const root = resolve(workspaceRoot);
  const workspace = resolve(root, trialId);
  const relativeWorkspace = relative(root, workspace);

  if (relativeWorkspace === "" || relativeWorkspace === ".." || relativeWorkspace.startsWith(`..${sep}`) || isAbsolute(relativeWorkspace)) {
    throw new Error("trial workspace must be inside workspace root");
  }

  return workspace;
}

async function assertWorkspaceDoesNotExist(workspace: string): Promise<void> {
  try {
    await stat(workspace);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }

  throw new Error(`trial workspace already exists: ${workspace}`);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function localRepoPath(repoUrl: string): string {
  if (repoUrl.startsWith("file://")) {
    return fileURLToPath(repoUrl);
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(repoUrl) || /^[^@\s]+@[^:\s]+:.+/.test(repoUrl)) {
    throw new Error(`unsupported git repository URL for local provisioning: ${redactUrl(repoUrl)}`);
  }

  return resolve(repoUrl);
}

function runGit(args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (code === 0) {
        resolvePromise(stdout);
        return;
      }

      reject(new Error(`git ${args[0]} failed with exit code ${code ?? 1}: ${stderr.trim()}`));
    });
  });
}

async function optionalGit(args: readonly string[], cwd: string): Promise<string | undefined> {
  try {
    return await runGit(args, cwd);
  } catch {
    return undefined;
  }
}

function redactUrl(url: string): string {
  return url.replace(/:\/\/([^/@:]+):([^/@]+)@/, "://<redacted>:<redacted>@");
}
