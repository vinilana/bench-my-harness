import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

export interface CliOutput {
  readonly stdout: (chunk?: string) => string | undefined;
  readonly stderr: (chunk?: string) => string | undefined;
}

export interface Spec19Workspace {
  readonly cwd: string;
  readonly catalogRoot: string;
  readonly workspaceRoot: string;
  readonly storeRoot: string;
  readonly specId: string;
  readonly trialId: string;
}

export function createOutput(): CliOutput {
  let stdout = "";
  let stderr = "";

  return {
    stdout: (chunk?: string) => {
      if (chunk === undefined) {
        return stdout;
      }

      stdout += chunk;
      return undefined;
    },
    stderr: (chunk?: string) => {
      if (chunk === undefined) {
        return stderr;
      }

      stderr += chunk;
      return undefined;
    }
  };
}

export async function createSpec19Workspace(input: {
  readonly prefix?: string;
  readonly specId?: string;
  readonly prompt?: string;
  readonly harnesses?: readonly ("codex" | "claude_code")[];
  readonly trials?: number;
} = {}): Promise<Spec19Workspace> {
  const cwd = await mkdtemp(join(tmpdir(), input.prefix ?? "bmh-spec19-"));
  const catalogRoot = join(cwd, ".bmh", "specs");
  const workspaceRoot = join(cwd, ".bmh", "workspaces");
  const storeRoot = join(cwd, ".bmh", "runs");
  const specId = input.specId ?? "project-command-generation";
  const trialId = `${specId}_codex_trial_1`;
  const featureDir = join(catalogRoot, "features", specId);
  const prompt = input.prompt ?? "Generate the project commands without leaking secrets.";

  await mkdir(featureDir, { recursive: true });
  await writeFile(
    join(catalogRoot, "suite.json"),
    `${JSON.stringify(
      {
        id: "spec19-real-harness-suite",
        name: "Spec 19 real harness suite",
        version: "1.0.0",
        specs: [{ id: specId, path: `features/${specId}/benchmark.json`, tags: ["spec19"] }],
        defaults: {
          trials: input.trials ?? 1,
          harnesses: input.harnesses ?? ["codex"],
          workspace_root: ".bmh/workspaces",
          strict_telemetry: false
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(join(featureDir, "spec.md"), `${prompt}\n`, "utf8");
  await writeFile(
    join(featureDir, "benchmark.json"),
    `${JSON.stringify(
      {
        id: specId,
        name: "Project command generation",
        version: "1.0.0",
        category: "feature",
        tags: ["spec19"],
        fixture: {
          path: "."
        },
        prompt: {
          file: "spec.md"
        },
        expected_output: {
          tests_must_pass: true
        },
        limits: {
          timeout_seconds: 5
        },
        evaluation: {
          scoring: {
            tests: 1
          }
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return { cwd, catalogRoot, workspaceRoot, storeRoot, specId, trialId };
}

export async function writeNodeExecutable(path: string, source: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `#!/usr/bin/env node\n${source}\n`, "utf8");
  await chmod(path, 0o755);
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function withProcessPath<T>(directories: readonly string[], action: () => Promise<T>): Promise<T> {
  const originalPath = process.env.PATH;
  process.env.PATH = [...directories, originalPath ?? ""].filter((value) => value.length > 0).join(delimiter);

  try {
    return await action();
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
  }
}
