import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/adapters/inbound/cli/main.js";
import { BenchmarkSchema } from "../../src/domain/benchmark/benchmark-schema.js";

describe("CLI benchmark init template mode", () => {
  test("init benchmark --template writes a valid benchmark JSON file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-"));
    const outputPath = join(dir, "login-validation.benchmark.json");
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "benchmark",
        "--template",
        "--id",
        "login-validation-001",
        "--name",
        "Login validation",
        "--category",
        "bugfix",
        "--repo-url",
        "file:///workspace/app",
        "--commit",
        "abc123",
        "--prompt",
        "Add input validation to the login form.",
        "--test-command",
        "npm test",
        "--output",
        outputPath
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(generated).toMatchObject({
      id: "login-validation-001",
      prompt: {
        text: "Add input validation to the login form."
      }
    });
    expect(output.stdout()).toContain(`benchmark template written: ${outputPath}`);
    expect(output.stderr()).toBe("");
  });

  test("generated template passes validate benchmark", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-"));
    const outputPath = join(dir, "benchmark.json");
    const initOutput = createOutput();
    const validateOutput = createOutput();

    await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "benchmark",
        "--template",
        "--id",
        "template-validate-001",
        "--name",
        "Template validate",
        "--category",
        "feature",
        "--repo-url",
        "file:///workspace/app",
        "--prompt",
        "Do the work.",
        "--test-command",
        "npm test",
        "--output",
        outputPath
      ],
      { stdout: initOutput.stdout, stderr: initOutput.stderr }
    );

    const exitCode = await runCli(["node", "bench-my-harness", "validate", "benchmark", outputPath], {
      stdout: validateOutput.stdout,
      stderr: validateOutput.stderr
    });

    expect(exitCode).toBe(0);
    expect(validateOutput.stdout()).toContain("benchmark valid: template-validate-001@1.0.0");
  });

  test("supports fixture benchmarks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-"));
    const outputPath = join(dir, "fixture.benchmark.json");

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "benchmark",
        "--template",
        "--id",
        "fixture-001",
        "--name",
        "Fixture benchmark",
        "--category",
        "bugfix",
        "--fixture-path",
        "fixtures/login",
        "--prompt",
        "Fix the bug.",
        "--test-command",
        "npm test",
        "--output",
        outputPath
      ],
      createRuntime()
    );

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(generated).toMatchObject({
      fixture: {
        path: "fixtures/login"
      }
    });
    expect(generated).not.toHaveProperty("repo");
  });

  test("supports local repository paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-"));
    const outputPath = join(dir, "repo-path.benchmark.json");

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "benchmark",
        "--template",
        "--id",
        "repo-path-001",
        "--name",
        "Repo path benchmark",
        "--category",
        "feature",
        "--repo-path",
        ".",
        "--prompt",
        "Do the work.",
        "--test-command",
        "npm test",
        "--output",
        outputPath
      ],
      { ...createRuntime(), cwd: dir }
    );

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(generated).toMatchObject({
      repo: {
        url: pathToFileURL(resolve(dir, ".")).href
      }
    });
  });

  test("supports markdown prompt files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-"));
    const outputPath = join(dir, "prompt-file.benchmark.json");
    await writeFile(join(dir, "task.spec.md"), "# Task\n\nDo the work.\n", "utf8");

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "benchmark",
        "--template",
        "--id",
        "prompt-file-001",
        "--name",
        "Prompt file benchmark",
        "--category",
        "feature",
        "--repo-url",
        "file:///workspace/app",
        "--prompt-file",
        "task.spec.md",
        "--test-command",
        "npm test",
        "--output",
        outputPath
      ],
      createRuntime()
    );

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(generated.prompt).toMatchObject({ file: "task.spec.md" });
    expect(generated.prompt).not.toHaveProperty("text");
  });

  test("rejects prompt text and prompt file together", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-"));
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "benchmark",
        "--template",
        "--id",
        "bad-prompt-001",
        "--name",
        "Bad prompt",
        "--category",
        "feature",
        "--repo-url",
        "file:///workspace/app",
        "--prompt",
        "Do the work.",
        "--prompt-file",
        "task.spec.md",
        "--test-command",
        "npm test",
        "--output",
        join(dir, "bad.benchmark.json")
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stderr()).toMatch(/prompt/i);
  });

  test("rejects repo URL and repo path together", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-"));
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "benchmark",
        "--template",
        "--id",
        "bad-source-001",
        "--name",
        "Bad source",
        "--category",
        "feature",
        "--repo-url",
        "file:///workspace/app",
        "--repo-path",
        ".",
        "--prompt",
        "Do the work.",
        "--test-command",
        "npm test",
        "--output",
        join(dir, "bad-source.benchmark.json")
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stderr()).toMatch(/repo/i);
  });

  test("overwrites existing output only with force", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-"));
    const outputPath = join(dir, "existing.benchmark.json");
    await writeFile(outputPath, "existing", "utf8");

    const first = await runCli(templateCommand(outputPath, []), createRuntime());
    const second = await runCli(templateCommand(outputPath, ["--force"]), createRuntime());

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({ id: "force-001" });
  });

  test("rejects missing prompt source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-init-"));
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "benchmark",
        "--template",
        "--id",
        "missing-prompt-001",
        "--name",
        "Missing prompt",
        "--category",
        "feature",
        "--repo-url",
        "file:///workspace/app",
        "--test-command",
        "npm test",
        "--output",
        join(dir, "missing-prompt.benchmark.json")
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stderr()).toMatch(/prompt/i);
  });
});

function templateCommand(outputPath: string, extra: string[]): string[] {
  return [
    "node",
    "bench-my-harness",
    "init",
    "benchmark",
    "--template",
    "--id",
    "force-001",
    "--name",
    "Force benchmark",
    "--category",
    "feature",
    "--repo-url",
    "file:///workspace/app",
    "--prompt",
    "Do the work.",
    "--test-command",
    "npm test",
    "--output",
    outputPath,
    ...extra
  ];
}

function createRuntime(): {
  stdout: (chunk?: string) => string | undefined;
  stderr: (chunk?: string) => string | undefined;
} {
  const output = createOutput();
  return { stdout: output.stdout, stderr: output.stderr };
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
