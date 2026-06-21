import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("CLI specs smoke", () => {
  test("runs a dry suite smoke with one trial per default harness", async () => {
    const cwd = await prepareTempWorkspace("dry-run-smoke");
    const output = createOutput();
    await writeRunnableCatalog(cwd);

    const exitCode = await runCli(
      ["node", "bench-my-harness", "specs", "smoke", "--run-id", "run_smoke_defaults"],
      runtime(cwd, output)
    );

    const results = JSON.parse(
      await readFile(join(cwd, ".bmh", "runs", "run_smoke_defaults", "results.json"), "utf8")
    ) as {
      run_id: string;
      trial_count: number;
      selected_harnesses: string[];
      trials: Array<{ spec_id: string; harness: string; status: string }>;
    };

    expect(exitCode).toBe(0);
    expect(results.run_id).toBe("run_smoke_defaults");
    expect(results.trial_count).toBe(2);
    expect(results.selected_harnesses).toEqual(["codex", "claude_code"]);
    expect(results.trials.map((trial) => `${trial.spec_id}:${trial.harness}:${trial.status}`)).toEqual([
      "project-command-generation:codex:completed",
      "project-command-generation:claude_code:completed"
    ]);
    await expect(stat(join(cwd, ".bmh", "runs", "run_smoke_defaults", "report.html"))).resolves.toBeDefined();
    expect(output.stderr()).toBe("");
  });
});

async function writeRunnableCatalog(cwd: string): Promise<void> {
  const featureDir = join(cwd, ".bmh", "specs", "features", "project-command-generation");
  await mkdir(featureDir, { recursive: true });
  await writeFile(join(featureDir, "spec.md"), "# Project Command Generation\n\nGenerate project commands.\n", "utf8");
  await writeFile(
    join(featureDir, "benchmark.json"),
    `${JSON.stringify(
      {
        id: "project-command-generation",
        name: "Project Command Generation",
        version: "1.0.0",
        category: "feature",
        tags: ["commands"],
        repo: {
          url: pathToFileURL(resolve(cwd)).href,
          base_ref: "base123",
          golden_ref: "golden456",
          setup_commands: ["npm install"],
          test_commands: ["npm test"]
        },
        prompt: {
          file: "spec.md"
        },
        expected_output: {
          tests_must_pass: true
        },
        limits: {
          timeout_seconds: 900
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
  await writeFile(
    join(cwd, ".bmh", "specs", "suite.json"),
    `${JSON.stringify(
      {
        id: "local-specs",
        name: "Local specs",
        version: "1.0.0",
        specs: [
          {
            id: "project-command-generation",
            path: "features/project-command-generation/benchmark.json",
            tags: ["commands"]
          }
        ],
        defaults: {
          repo_path: ".",
          category: "feature",
          trials: 3,
          harnesses: ["codex", "claude_code"],
          workspace_root: ".bmh/workspaces",
          strict_telemetry: false,
          setup_commands: ["npm install"],
          test_commands: ["npm test"],
          include_in_suite: true
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function prepareTempWorkspace(slug: string): Promise<string> {
  const dir = join(tmpdir(), "bench-my-harness-acceptance-17-smoke", slug);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

function runtime(cwd: string, output: ReturnType<typeof createOutput>): {
  cwd: string;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
} {
  return { cwd, stdout: output.stdout, stderr: output.stderr };
}

function createOutput(): {
  stdout: (chunk?: string) => string | undefined;
  stderr: (chunk?: string) => string | undefined;
} {
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
