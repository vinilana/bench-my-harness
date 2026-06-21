import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("CLI spec import", () => {
  test("imports multiple Markdown prompt files into the configured catalog", async () => {
    const cwd = await prepareTempWorkspace("multiple-files");
    const output = createOutput();
    await writeConfiguredSuite(cwd);
    await mkdir(join(cwd, "docs", "specs"), { recursive: true });
    await writeFile(join(cwd, "docs", "specs", "15-project-command-generation.md"), "# Project Command Generation\n", "utf8");
    await writeFile(join(cwd, "docs", "specs", "16-spec-catalog-reporting.md"), "# Spec Catalog Reporting\n", "utf8");

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "import",
        "docs/specs/15-project-command-generation.md",
        "docs/specs/16-spec-catalog-reporting.md",
        "--base-ref",
        "base123",
        "--golden-ref",
        "HEAD"
      ],
      runtime(cwd, output)
    );

    expect(exitCode).toBe(0);

    const suite = await readJson(join(cwd, ".bmh", "specs", "suite.json"));
    const firstBenchmark = await readJson(
      join(cwd, ".bmh", "specs", "features", "project-command-generation", "benchmark.json")
    );
    const secondBenchmark = await readJson(
      join(cwd, ".bmh", "specs", "features", "spec-catalog-reporting", "benchmark.json")
    );

    expect(suite.specs).toEqual([
      {
        id: "project-command-generation",
        path: "features/project-command-generation/benchmark.json"
      },
      {
        id: "spec-catalog-reporting",
        path: "features/spec-catalog-reporting/benchmark.json"
      }
    ]);
    expect(firstBenchmark).toMatchObject({
      id: "project-command-generation",
      repo: { url: pathToFileURL(resolve(cwd)).href, base_ref: "base123", golden_ref: "HEAD" }
    });
    expect(secondBenchmark).toMatchObject({
      id: "spec-catalog-reporting",
      repo: { url: pathToFileURL(resolve(cwd)).href, base_ref: "base123", golden_ref: "HEAD" }
    });
  });

  test("rejects duplicate inferred ids without force", async () => {
    const cwd = await prepareTempWorkspace("duplicate-ids");
    const output = createOutput();
    await writeConfiguredSuite(cwd);
    await mkdir(join(cwd, "docs", "specs"), { recursive: true });
    await writeFile(join(cwd, "docs", "specs", "15-project-command-generation.md"), "# First\n", "utf8");
    await writeFile(join(cwd, "docs", "specs", "project-command-generation.md"), "# Second\n", "utf8");

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "import",
        "docs/specs/15-project-command-generation.md",
        "docs/specs/project-command-generation.md",
        "--base-ref",
        "base123",
        "--golden-ref",
        "HEAD"
      ],
      runtime(cwd, output)
    );

    expect(exitCode).toBe(1);
    expect(output.stderr()).toMatch(/duplicate|project-command-generation/i);
  });

  test("generated catalog validates after import", async () => {
    const cwd = await prepareTempWorkspace("validates-after-import");
    const output = createOutput();
    await writeConfiguredSuite(cwd);
    await mkdir(join(cwd, "docs", "specs"), { recursive: true });
    await writeFile(join(cwd, "docs", "specs", "15-project-command-generation.md"), "# Project Command Generation\n", "utf8");

    const importExitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "import",
        "docs/specs/15-project-command-generation.md",
        "--base-ref",
        "base123",
        "--golden-ref",
        "HEAD"
      ],
      runtime(cwd, output)
    );
    const validateExitCode = await runCli(
      ["node", "bench-my-harness", "doctor"],
      runtime(cwd, output)
    );

    expect(importExitCode).toBe(0);
    expect(validateExitCode).toBe(0);
    expect(output.stderr()).toBe("");
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

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function prepareTempWorkspace(slug: string): Promise<string> {
  const dir = join(tmpdir(), "bench-my-harness-acceptance-17-import", slug);
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
