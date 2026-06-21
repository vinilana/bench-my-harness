import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  DiffGeneratorInput,
  DiffGeneratorPort,
  DiffGeneratorResult
} from "../../../application/ports/diff-generator-port.js";

const GENERATED_DIFF_PATH = ".bmh/generated.diff.patch";

export class FilesystemGitDiffGenerator implements DiffGeneratorPort {
  public async generate(input: DiffGeneratorInput): Promise<DiffGeneratorResult> {
    const diff = await gitDiff(input.workspace);
    await mkdir(join(input.workspace, ".bmh"), { recursive: true });
    await writeFile(join(input.workspace, GENERATED_DIFF_PATH), diff, "utf8");

    return { diffPath: GENERATED_DIFF_PATH };
  }
}

function gitDiff(workspace: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["diff", "--binary"], {
      cwd: workspace,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString("utf8"));
        return;
      }

      reject(new Error(`git diff failed with exit code ${code ?? 1}: ${Buffer.concat(stderrChunks).toString("utf8").trim()}`));
    });
  });
}
