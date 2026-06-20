import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

  test("interactive mode accepts current directory as repo path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-interactive-"));
    const outputPath = join(dir, "interactive-repo-path.benchmark.json");

    const exitCode = await runCli(["node", "bench-my-harness", "init", "benchmark", "--output", outputPath], {
      stdin: interactiveAnswers([
        "interactive-repo-path-001",
        "Interactive repo path",
        "feature",
        "repo",
        ".",
        "",
        "n",
        "",
        "npm test",
        "text",
        "Implement from current directory.",
        "",
        "900",
        "",
        "",
        "",
        ""
      ]),
      cwd: dir,
      ...createOutput()
    });

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(generated).toMatchObject({
      repo: {
        url: pathToFileURL(resolve(dir, ".")).href
      }
    });
  });

  test("interactive mode accepts detected project commands for a local repo path", async () => {
    const dir = await createNodeProject({
      scripts: {
        test: "vitest run",
        typecheck: "tsc --noEmit"
      }
    });
    const outputPath = join(dir, "interactive-detected.benchmark.json");

    const exitCode = await runCli(["node", "bench-my-harness", "init", "benchmark", "--output", outputPath], {
      stdin: interactiveAnswers([
        "interactive-detected-001",
        "Interactive detected",
        "feature",
        "repo",
        ".",
        "",
        "y",
        "text",
        "Implement with detected commands.",
        "",
        "900",
        "",
        "",
        "",
        ""
      ]),
      cwd: dir,
      ...createOutput()
    });

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(generated.repo).toMatchObject({
      setup_commands: ["npm install"],
      test_commands: ["npm test", "npm run typecheck"]
    });
  });

  test("interactive mode can decline detected commands and enter manual commands", async () => {
    const dir = await createNodeProject({ scripts: { test: "vitest run" } });
    const outputPath = join(dir, "interactive-manual.benchmark.json");

    const exitCode = await runCli(["node", "bench-my-harness", "init", "benchmark", "--output", outputPath], {
      stdin: interactiveAnswers([
        "interactive-manual-001",
        "Interactive manual",
        "feature",
        "repo",
        ".",
        "",
        "n",
        "npm ci",
        "npm run custom-check",
        "text",
        "Implement with manual commands.",
        "",
        "900",
        "",
        "",
        "",
        ""
      ]),
      cwd: dir,
      ...createOutput()
    });

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(generated.repo).toMatchObject({
      setup_commands: ["npm ci"],
      test_commands: ["npm run custom-check"]
    });
  });

  test("interactive mode asks questions when stdin is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-interactive-"));
    const outputPath = join(dir, "question-provider.benchmark.json");
    const output = createOutput();
    const labels: string[] = [];
    const answers = [
      "question-provider-001",
      "Question provider benchmark",
      "feature",
      "repo",
      "file:///workspace/app",
      "abc123",
      "",
      "npm test",
      "text",
      "Implement from question provider.",
      "",
      "900",
      "",
      "",
      "",
      ""
    ];

    const exitCode = await runCli(["node", "bench-my-harness", "init", "benchmark", "--output", outputPath], {
      stdout: output.stdout,
      stderr: output.stderr,
      question: (label: string) => {
        labels.push(label);
        const answer = answers.shift();

        if (answer === undefined) {
          throw new Error(`missing answer for ${label}`);
        }

        return answer;
      }
    });

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(labels[0]).toBe("Benchmark id");
    expect(generated).toMatchObject({
      id: "question-provider-001",
      prompt: {
        text: "Implement from question provider."
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

async function createNodeProject(input: { readonly scripts: Record<string, string> }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bmh-cli-init-interactive-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: input.scripts }, null, 2), "utf8");
  await writeFile(join(root, "package-lock.json"), "", "utf8");
  return root;
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
