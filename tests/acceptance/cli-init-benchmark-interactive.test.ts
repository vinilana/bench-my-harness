import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/adapters/inbound/cli/main.js";
import { BenchmarkSchema } from "../../src/domain/benchmark/benchmark-schema.js";

describe("CLI benchmark init interactive mode", () => {
  test("init benchmark defaults to interactive mode and writes a valid benchmark", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-interactive-"));
    const outputPath = join(dir, "interactive.benchmark.json");
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "init", "benchmark", "--output", outputPath], {
      stdin: interactiveAnswers([
        "interactive-001",
        "Interactive benchmark",
        "feature",
        "repo",
        "file:///workspace/app",
        "abc123",
        "",
        "npm test",
        "text",
        "Implement the feature from interactive input.",
        "Do not change package.json",
        "900",
        "",
        "src/login.ts",
        "",
        "Unit tests must pass"
      ]),
      stdout: output.stdout,
      stderr: output.stderr
    });

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("Benchmark id");
    expect(generated).toMatchObject({
      id: "interactive-001",
      repo: {
        url: "file:///workspace/app",
        commit: "abc123",
        test_commands: ["npm test"]
      },
      prompt: {
        text: "Implement the feature from interactive input.",
        constraints: ["Do not change package.json"]
      },
      expected_output: {
        required_files_changed: ["src/login.ts"],
        semantic_requirements: ["Unit tests must pass"]
      }
    });
  });

  test("interactive mode supports markdown prompt files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-interactive-"));
    const outputPath = join(dir, "interactive-prompt-file.benchmark.json");

    const exitCode = await runCli(["node", "bench-my-harness", "init", "benchmark", "--output", outputPath], {
      stdin: interactiveAnswers([
        "interactive-prompt-file-001",
        "Interactive prompt file",
        "feature",
        "fixture",
        "fixtures/app",
        "",
        "npm test",
        "file",
        "task.spec.md",
        "",
        "900",
        "",
        "",
        "",
        ""
      ]),
      ...createOutput()
    });

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(generated).toMatchObject({
      fixture: {
        path: "fixtures/app",
        test_commands: ["npm test"]
      },
      prompt: {
        file: "task.spec.md"
      }
    });
  });

  test("interactive EOF returns a clear non-zero exit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-interactive-"));
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "init", "benchmark", "--output", join(dir, "eof.benchmark.json")],
      {
        stdin: "only-one-answer\n",
        stdout: output.stdout,
        stderr: output.stderr
      }
    );

    expect(exitCode).toBe(1);
    expect(output.stderr()).toMatch(/interactive input ended|eof/i);
  });
});

function interactiveAnswers(answers: string[]): string {
  return `${answers.join("\n")}\n`;
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
