import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/adapters/inbound/cli/main.js";
import { BenchmarkSchema } from "../../src/domain/benchmark/benchmark-schema.js";

describe("CLI benchmark init command detection", () => {
  test("--detect-commands writes explicit setup and validation commands", async () => {
    const root = await createNodeProject({
      scripts: {
        test: "vitest run",
        typecheck: "tsc --noEmit"
      }
    });
    const outputPath = join(root, "detected.benchmark.json");
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "benchmark", "init",
        "--template",
        "--id",
        "detected-001",
        "--name",
        "Detected commands",
        "--category",
        "feature",
        "--repo-path",
        ".",
        "--detect-commands",
        "--prompt",
        "Do the work.",
        "--output",
        outputPath
      ],
      { cwd: root, stdout: output.stdout, stderr: output.stderr }
    );

    const generated = BenchmarkSchema.parse(JSON.parse(await readFile(outputPath, "utf8")));
    expect(exitCode).toBe(0);
    expect(generated.repo).toMatchObject({
      setup_commands: ["npm install"],
      test_commands: ["npm test", "npm run typecheck"]
    });
    expect(output.stdout()).toContain("benchmark template written:");
  });

  test("--detect-commands requires repo-path", async () => {
    const root = await createNodeProject({ scripts: { test: "vitest run" } });
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "benchmark", "init",
        "--template",
        "--id",
        "bad-detect-001",
        "--name",
        "Bad detect",
        "--category",
        "feature",
        "--repo-url",
        "file:///workspace/app",
        "--detect-commands",
        "--prompt",
        "Do the work.",
        "--output",
        join(root, "bad.benchmark.json")
      ],
      { cwd: root, stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stderr()).toMatch(/repo-path/i);
  });

  test("rejects detect-commands with manual setup or test commands", async () => {
    const root = await createNodeProject({ scripts: { test: "vitest run" } });
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "benchmark", "init",
        "--template",
        "--id",
        "bad-commands-001",
        "--name",
        "Bad commands",
        "--category",
        "feature",
        "--repo-path",
        ".",
        "--detect-commands",
        "--setup-command",
        "npm ci",
        "--prompt",
        "Do the work.",
        "--output",
        join(root, "bad-commands.benchmark.json")
      ],
      { cwd: root, stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stderr()).toMatch(/manual setup or test commands/i);
  });

  test("generated benchmark passes benchmark validate", async () => {
    const root = await createNodeProject({ scripts: { test: "vitest run" } });
    const outputPath = join(root, "valid.benchmark.json");

    await runCli(
      [
        "node",
        "bench-my-harness",
        "benchmark", "init",
        "--template",
        "--id",
        "valid-detected-001",
        "--name",
        "Valid detected",
        "--category",
        "feature",
        "--repo-path",
        ".",
        "--detect-commands",
        "--prompt",
        "Do the work.",
        "--output",
        outputPath
      ],
      createRuntime(root)
    );

    const validateOutput = createOutput();
    const exitCode = await runCli(["node", "bench-my-harness", "benchmark", "validate", outputPath], {
      cwd: root,
      stdout: validateOutput.stdout,
      stderr: validateOutput.stderr
    });

    expect(exitCode).toBe(0);
    expect(validateOutput.stdout()).toContain("benchmark valid: valid-detected-001@1.0.0");
  });
});

async function createNodeProject(input: { readonly scripts: Record<string, string> }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bmh-cli-detect-commands-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: input.scripts }, null, 2), "utf8");
  await writeFile(join(root, "package-lock.json"), "", "utf8");
  return root;
}

function createRuntime(cwd: string) {
  const output = createOutput();
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
