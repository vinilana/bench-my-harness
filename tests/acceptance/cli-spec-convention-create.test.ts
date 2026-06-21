import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("CLI add convention authoring", () => {
  test("creates a spec from a Markdown prompt argument using suite defaults", async () => {
    const cwd = await prepareTempWorkspace("create-from-prompt");
    const output = createOutput();
    await writeConfiguredSuite(cwd);
    await mkdir(join(cwd, "docs", "specs"), { recursive: true });
    await writeFile(
      join(cwd, "docs", "specs", "15-project-command-generation.md"),
      "# Project Command Generation Spec\n\nGenerate project commands from package metadata.\n",
      "utf8"
    );

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "add",
        "docs/specs/15-project-command-generation.md",
        "--base-ref",
        "base123",
        "--golden-ref",
        "golden456"
      ],
      runtime(cwd, output)
    );

    expect(exitCode).toBe(0);

    const specPath = join(cwd, ".bmh", "specs", "features", "project-command-generation", "spec.md");
    const benchmarkPath = join(cwd, ".bmh", "specs", "features", "project-command-generation", "benchmark.json");
    const suite = await readJson(join(cwd, ".bmh", "specs", "suite.json"));
    const benchmark = await readJson(benchmarkPath);

    expect(await readFile(specPath, "utf8")).toBe(
      "# Project Command Generation Spec\n\nGenerate project commands from package metadata.\n"
    );
    expect(benchmark).toMatchObject({
      id: "project-command-generation",
      name: "Project Command Generation Spec",
      category: "feature",
      repo: {
        url: pathToFileURL(resolve(cwd)).href,
        base_ref: "base123",
        golden_ref: "golden456",
        setup_commands: ["npm install"],
        test_commands: ["npm test", "npm run typecheck", "npm run build"]
      },
      prompt: {
        file: "spec.md"
      },
      metadata: {
        source: "manual_cli",
        source_prompt_file: "docs/specs/15-project-command-generation.md"
      }
    });
    expect(suite.specs).toEqual([
      {
        id: "project-command-generation",
        path: "features/project-command-generation/benchmark.json"
      }
    ]);
    expect(output.stderr()).toBe("");
  });

  test("explicit id, name, category, and command flags override inferred defaults", async () => {
    const cwd = await prepareTempWorkspace("explicit-overrides");
    const output = createOutput();
    await writeConfiguredSuite(cwd);
    await mkdir(join(cwd, "prompts"), { recursive: true });
    await writeFile(join(cwd, "prompts", "Project Command Generation.md"), "No H1 in this prompt.\n", "utf8");

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "add",
        "prompts/Project Command Generation.md",
        "--id",
        "custom-project-command",
        "--name",
        "Custom Project Command",
        "--category",
        "bugfix",
        "--base-ref",
        "base123",
        "--golden-ref",
        "golden456",
        "--setup-command",
        "pnpm install --frozen-lockfile",
        "--test-command",
        "pnpm test:unit"
      ],
      runtime(cwd, output)
    );

    expect(exitCode).toBe(0);

    const benchmark = await readJson(
      join(cwd, ".bmh", "specs", "features", "custom-project-command", "benchmark.json")
    );

    expect(benchmark).toMatchObject({
      id: "custom-project-command",
      name: "Custom Project Command",
      category: "bugfix",
      repo: {
        setup_commands: ["pnpm install --frozen-lockfile"],
        test_commands: ["pnpm test:unit"]
      }
    });
  });
});

async function writeConfiguredSuite(cwd: string): Promise<void> {
  await mkdir(join(cwd, ".bmh", "specs"), { recursive: true });
  await writeFile(
    join(cwd, ".bmh", "specs", "suite.json"),
    `${JSON.stringify(
      {
        id: "local-specs",
        name: "Local specs",
        version: "1.0.0",
        specs: [],
        defaults: {
          repo_path: ".",
          category: "feature",
          trials: 3,
          harnesses: ["codex", "claude_code"],
          workspace_root: ".bmh/workspaces",
          strict_telemetry: false,
          setup_commands: ["npm install"],
          test_commands: ["npm test", "npm run typecheck", "npm run build"],
          include_in_suite: true
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function prepareTempWorkspace(slug: string): Promise<string> {
  const dir = join(tmpdir(), "bench-my-harness-acceptance-17-create", slug);
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
