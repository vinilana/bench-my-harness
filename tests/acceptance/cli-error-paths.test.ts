import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("CLI error paths", () => {
  test("add --from-git without --base-ref fails with an add-specific message", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-add-base-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "add", "--from-git"], runtime(cwd, output));

    expect(exitCode).not.toBe(0);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("add --from-git requires --base-ref");
    expect(output.stderr()).not.toContain("benchmark init");
    await expect(stat(join(cwd, ".bmh", "specs"))).rejects.toThrow();
  });

  test("add --from-git without --golden-ref fails with an add-specific message", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-add-golden-"));
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "add", "--from-git", "--base-ref", "HEAD~1"],
      runtime(cwd, output)
    );

    expect(exitCode).not.toBe(0);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("add --from-git requires --golden-ref");
    expect(output.stderr()).not.toContain("benchmark init");
    await expect(stat(join(cwd, ".bmh", "specs"))).rejects.toThrow();
  });

  test("add rejects a positional prompt file together with --prompt-file", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-add-prompt-"));
    const output = createOutput();
    await writeFile(join(cwd, "a.md"), "# A\n", "utf8");
    await writeFile(join(cwd, "b.md"), "# B\n", "utf8");

    const exitCode = await runCli(
      ["node", "bench-my-harness", "add", "a.md", "--prompt-file", "b.md"],
      runtime(cwd, output)
    );

    expect(exitCode).not.toBe(0);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("add accepts either <promptFile> or --prompt-file");
    expect(output.stderr()).not.toContain("benchmark init");
    await expect(stat(join(cwd, ".bmh", "specs"))).rejects.toThrow();
  });

  test("add interactive mode rejects fixture sources with an add-specific message", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-add-interactive-fixture-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "add"], {
      ...runtime(cwd, output),
      isTty: true,
      stdin: interactiveAnswers([
        "feature",
        "fixture",
        "fixtures/login",
        "",
        "npm test",
        "text",
        "Implement the fixture-backed change.",
        "",
        "",
        "",
        "",
        "",
        ""
      ])
    });

    expect(exitCode).not.toBe(0);
    expect(output.stdout()).toContain("Source (repo|fixture) [repo]:");
    expect(output.stderr()).toContain("add interactive mode requires a repo source");
    expect(output.stderr()).not.toContain("benchmark init");
    await expect(stat(join(cwd, ".bmh", "specs"))).rejects.toThrow();
  });

  test("removed pre-consolidation commands are unknown", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-init-detect-manual-"));
    const output = createOutput();
    const removedCommands = [
      ["benchmark"],
      ["benchmark", "init"],
      ["benchmark", "validate", "benchmark.json"],
      ["benchmark", "run"],
      ["benchmark", "--help"],
      ["smoke"],
      ["smoke", "--help"],
      ["import", "docs/specs/*.md"],
      ["import", "--help"],
      ["doctor"]
    ];

    for (const command of removedCommands) {
      const exitCode = await runCli(["node", "bench-my-harness", ...command], runtime(cwd, output));

      expect(exitCode).not.toBe(0);
    }

    expect(output.stderr()).toContain("unknown command");
  });

  test("check rejects YAML benchmarks with a clear message", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-validate-yaml-"));
    const output = createOutput();
    await writeFile(join(cwd, "benchmark.yml"), "id: yaml\n", "utf8");

    const exitCode = await runCli(["node", "bench-my-harness", "check", "benchmark.yml"], runtime(cwd, output));

    expect(exitCode).not.toBe(0);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("check invalid:");
    expect(output.stderr()).toContain("YAML benchmarks are not supported");
  });

  test("run --benchmark rejects malformed harness command JSON values", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-benchmark-run-json-"));
    const output = createOutput();
    const benchmarkPath = resolve("tests/fixtures/benchmarks/login-validation.benchmark.json");

    const cases: Array<{ json: string; message: string }> = [
      { json: "[]", message: "run --benchmark --harness-command-json must be an object" },
      { json: "{\"args\":[]}", message: "run --benchmark --harness-command-json requires executable" },
      {
        json: "{\"executable\":\"node\",\"args\":[1]}",
        message: "run --benchmark --harness-command-json args must be an array of strings"
      }
    ];

    for (const entry of cases) {
      const exitCode = await runCli(
        [
          "node",
          "bench-my-harness",
          "run", "--benchmark",
          benchmarkPath,
          "--harness",
          "codex",
          "--workspace-root",
          join(cwd, "workspaces"),
          "--harness-command-json",
          entry.json
        ],
        runtime(cwd, output)
      );

      expect(exitCode).not.toBe(0);
      expect(output.stderr()).toContain(entry.message);
    }
  });

  test("run --benchmark reports a missing harness executable clearly", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-benchmark-run-missing-"));
    const output = createOutput();
    const benchmarkPath = resolve("tests/fixtures/benchmarks/login-validation.benchmark.json");

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "run", "--benchmark",
        benchmarkPath,
        "--harness",
        "codex",
        "--workspace-root",
        join(cwd, "workspaces"),
        "--run-id",
        "run_missing_harness",
        "--harness-command-json",
        "{\"executable\":\"definitely-not-bmh-harness\"}"
      ],
      runtime(cwd, output)
    );

    expect(exitCode).not.toBe(0);
    expect(output.stdout()).toContain("\"failure_classification\":\"environment_failed\"");
    expect(output.stderr()).toContain("definitely-not-bmh-harness");
  });

  test("run --benchmark does not echo arbitrary process stderr on failure", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-benchmark-run-secret-stderr-"));
    const output = createOutput();
    const benchmarkPath = resolve("tests/fixtures/benchmarks/login-validation.benchmark.json");
    const fakeHarnessPath = join(cwd, "secret-stderr-harness.mjs");
    await writeFile(
      fakeHarnessPath,
      "process.stderr.write('OPENAI_API_KEY=sk-test-1234567890\\n'); process.exit(1);\n",
      "utf8"
    );

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "run", "--benchmark",
        benchmarkPath,
        "--harness",
        "codex",
        "--workspace-root",
        join(cwd, "workspaces"),
        "--run-id",
        "run_secret_stderr",
        "--harness-command-json",
        JSON.stringify({ executable: process.execPath, args: [fakeHarnessPath] })
      ],
      runtime(cwd, output)
    );

    expect(exitCode).not.toBe(0);
    expect(`${output.stdout()}${output.stderr()}`).not.toContain("sk-test-1234567890");
    expect(`${output.stdout()}${output.stderr()}`).not.toContain("OPENAI_API_KEY=");
  });

  test("add rejects globs that match no prompt files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-import-glob-"));
    const output = createOutput();
    await writeConfiguredSuite(cwd);

    const exitCode = await runCli(
      ["node", "bench-my-harness", "add", "docs/specs/*.md", "--base-ref", "base", "--golden-ref", "HEAD"],
      runtime(cwd, output)
    );

    expect(exitCode).not.toBe(0);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("add prompt file pattern matched no files: docs/specs/*.md");
    const suite = JSON.parse(await readFile(join(cwd, ".bmh", "specs", "suite.json"), "utf8")) as { specs: unknown[] };
    expect(suite.specs).toEqual([]);
  });

  test("run rejects conflicting real and dry-run modes", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-run-modes-"));
    const output = createOutput();
    await writeConfiguredSuite(cwd);

    const exitCode = await runCli(["node", "bench-my-harness", "run", "--real", "--dry-run"], runtime(cwd, output));

    expect(exitCode).not.toBe(0);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("run cannot use --real and --dry-run together");
  });

  test("run rejects real mode when harness command JSON is not command-scoped", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-run-json-"));
    const output = createOutput();
    await writeConfiguredSuite(cwd);

    const cases: Array<{ args: string[]; message: string }> = [
      {
        args: ["--real", "--harness-command-json", "[]"],
        message: "run --harness-command-json must be an object"
      },
      {
        args: ["--real", "--harness", "codex", "--harness", "claude_code", "--harness-command-json", "{\"executable\":\"node\"}"],
        message: "run --harness-command-json with a single command requires exactly one selected harness"
      }
    ];

    for (const entry of cases) {
      const exitCode = await runCli(["node", "bench-my-harness", "run", ...entry.args], runtime(cwd, output));

      expect(exitCode).not.toBe(0);
      expect(output.stderr()).toContain(entry.message);
    }
  });

  test("run without --real or --dry-run fails fast in non-interactive mode", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-run-real-"));
    const output = createOutput();
    await writeConfiguredSuite(cwd);

    const exitCode = await runCli(["node", "bench-my-harness", "run"], runtime(cwd, output));

    expect(exitCode).toBe(78);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("run requires --dry-run or --real");
  });

  test("report requires an input path or run id and rejects non-object input", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-report-"));
    const output = createOutput();
    await writeFile(join(cwd, "report.json"), "[]", "utf8");

    const missingExit = await runCli(["node", "bench-my-harness", "report"], runtime(cwd, output));
    const invalidExit = await runCli(["node", "bench-my-harness", "report", "--input", "report.json"], runtime(cwd, output));

    expect(missingExit).not.toBe(0);
    expect(invalidExit).not.toBe(0);
    expect(output.stderr()).toContain("report requires --input <path> or --run-id <id>");
    expect(output.stderr()).toContain("report input must be a JSON object");
  });

  test("internal hook-capture rejects invalid providers and missing required options", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-errors-hook-"));
    const output = createOutput();

    const invalidProviderExit = await runCli(
      [
        "node",
        "bench-my-harness",
        "internal",
        "hook-capture",
        "--provider",
        "cursor",
        "--event",
        "PreToolUse",
        "--run-id",
        "run_hook",
        "--trial-id",
        "trial_hook",
        "--spool",
        join(cwd, "events.jsonl")
      ],
      runtime(cwd, output)
    );
    const missingEventExit = await runCli(
      [
        "node",
        "bench-my-harness",
        "internal",
        "hook-capture",
        "--provider",
        "codex",
        "--run-id",
        "run_hook",
        "--trial-id",
        "trial_hook",
        "--spool",
        join(cwd, "events.jsonl")
      ],
      runtime(cwd, output)
    );
    const missingRunIdExit = await runCli(
      [
        "node",
        "bench-my-harness",
        "internal",
        "hook-capture",
        "--provider",
        "codex",
        "--event",
        "PreToolUse",
        "--trial-id",
        "trial_hook",
        "--spool",
        join(cwd, "events.jsonl")
      ],
      runtime(cwd, output)
    );
    const missingTrialIdExit = await runCli(
      [
        "node",
        "bench-my-harness",
        "internal",
        "hook-capture",
        "--provider",
        "codex",
        "--event",
        "PreToolUse",
        "--run-id",
        "run_hook",
        "--spool",
        join(cwd, "events.jsonl")
      ],
      runtime(cwd, output)
    );
    const missingSpoolExit = await runCli(
      [
        "node",
        "bench-my-harness",
        "internal",
        "hook-capture",
        "--provider",
        "codex",
        "--event",
        "PreToolUse",
        "--run-id",
        "run_hook",
        "--trial-id",
        "trial_hook"
      ],
      runtime(cwd, output)
    );

    expect(invalidProviderExit).not.toBe(0);
    expect(missingEventExit).not.toBe(0);
    expect(missingRunIdExit).not.toBe(0);
    expect(missingTrialIdExit).not.toBe(0);
    expect(missingSpoolExit).not.toBe(0);
    expect(output.stderr()).toContain("unsupported provider: cursor");
    expect(output.stderr()).toContain("required option '--event <event>' not specified");
    expect(output.stderr()).toContain("internal hook-capture requires --run-id");
    expect(output.stderr()).toContain("internal hook-capture requires --trial-id");
    expect(output.stderr()).toContain("required option '--spool <path>' not specified");
  });

  test("README command reference keeps hook-capture required options visible", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain(
      "bmh internal hook-capture --provider codex --event PreToolUse --run-id <run-id> --trial-id <trial-id> --spool <path>"
    );
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
          trials: 1,
          harnesses: ["codex", "claude_code"],
          workspace_root: ".bmh/workspaces",
          strict_telemetry: false,
          setup_commands: [],
          test_commands: [],
          include_in_suite: true
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function runtime(cwd: string, output: ReturnType<typeof createOutput>): {
  cwd: string;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
} {
  return { cwd, stdout: output.stdout, stderr: output.stderr };
}

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
