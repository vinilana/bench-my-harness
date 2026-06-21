import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("CLI prompt file validation and execution", () => {
  test("benchmark validate passes when prompt.file exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-prompt-file-"));
    const benchmarkPath = join(dir, "benchmark.json");
    const output = createOutput();
    await writeFile(join(dir, "task.md"), "# Task\n\nDo the work.\n", "utf8");
    await writeFile(benchmarkPath, JSON.stringify(benchmarkWithPromptFile("task.md")), "utf8");

    const exitCode = await runCli(["node", "bench-my-harness", "benchmark", "validate", benchmarkPath], {
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("benchmark valid: prompt-file-cli-001@1.0.0");
    expect(output.stderr()).toBe("");
  });

  test("benchmark validate fails when prompt.file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-prompt-file-"));
    const benchmarkPath = join(dir, "benchmark.json");
    const output = createOutput();
    await writeFile(benchmarkPath, JSON.stringify(benchmarkWithPromptFile("missing.md")), "utf8");

    const exitCode = await runCli(["node", "bench-my-harness", "benchmark", "validate", benchmarkPath], {
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toMatch(/prompt file|missing\.md/i);
  });

  test("run passes markdown prompt file content to the harness", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-prompt-file-"));
    const benchmarkPath = join(dir, "benchmark.json");
    const harnessPath = join(dir, "fake-harness.mjs");
    const capturePath = join(dir, "capture.json");
    const output = createOutput();
    await writeFile(join(dir, "task.md"), "# Markdown Task\n\nImplement from the spec file.\n", "utf8");
    await writeFile(benchmarkPath, JSON.stringify(benchmarkWithPromptFile("task.md")), "utf8");
    await writeFile(
      harnessPath,
      `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
await import("node:fs/promises").then(({ writeFile }) => writeFile(process.env.CAPTURE_PATH, JSON.stringify({
  prompt: Buffer.concat(chunks).toString("utf8")
})));
`,
      "utf8"
    );

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness", "benchmark", "run", "--benchmark",
        benchmarkPath,
        "--harness",
        "codex",
        "--workspace-root",
        join(dir, "workspaces"),
        "--run-id",
        "run_prompt_file",
        "--trial-id",
        "trial_prompt_file",
        "--harness-command-json",
        JSON.stringify({
          executable: process.execPath,
          args: [harnessPath],
          env: { CAPTURE_PATH: capturePath }
        })
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(await readFile(capturePath, "utf8"))).toMatchObject({
      prompt: "# Markdown Task\n\nImplement from the spec file.\n"
    });
  });
});

function benchmarkWithPromptFile(promptFile: string): Record<string, unknown> {
  return {
    id: "prompt-file-cli-001",
    name: "Prompt file CLI",
    version: "1.0.0",
    category: "feature",
    repo: {
      url: "file:///tmp/bmh/app",
      test_commands: ["npm test"]
    },
    prompt: {
      file: promptFile
    },
    expected_output: {
      tests_must_pass: true
    },
    limits: {
      timeout_seconds: 30
    },
    evaluation: {
      scoring: {
        tests: 1
      }
    }
  };
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
