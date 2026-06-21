import { mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { isCliEntrypoint, runCli } from "../../src/adapters/inbound/cli/main.js";
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };

describe("public CLI surface", () => {
  test("top-level help shows workflow commands and hides internal hook capture", async () => {
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "--help"], {
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("init");
    expect(output.stdout()).toContain("add");
    expect(output.stdout()).toContain("smoke");
    expect(output.stdout()).toContain("run");
    expect(output.stdout()).toContain("report");
    expect(output.stdout()).toContain("doctor");
    expect(output.stdout()).toContain("benchmark");
    expect(output.stdout()).not.toContain("hook-capture");
    expect(output.stderr()).toBe("");
  });

  test("removed legacy specs namespace is not accepted", async () => {
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "specs", "run", "--dry-run"], {
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).not.toBe(0);
    expect(`${output.stdout()}${output.stderr()}`).toContain("unknown command");
  });

  test("internal hook-capture parses flags, reads stdin, and writes the spool", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-hook-"));
    const spool = join(dir, "events.jsonl");
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness", "internal", "hook-capture",
        "--provider",
        "codex",
        "--event",
        "PreToolUse",
        "--run-id",
        "run_cli",
        "--trial-id",
        "trial_cli",
        "--event-source",
        "stdin",
        "--spool",
        spool
      ],
      {
        stdin: JSON.stringify(codexPreToolUse),
        stdout: output.stdout,
        stderr: output.stderr
      }
    );

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect((await stat(spool)).size).toBeGreaterThan(0);

    const [line] = (await readFile(spool, "utf8")).trim().split("\n");
    const event = JSON.parse(line) as Record<string, unknown>;
    expect(event.provider).toBe("codex");
    expect(event.run_id).toBe("run_cli");
    expect(event.trial_id).toBe("trial_cli");
  });

  test("benchmark validate accepts a valid fixture", async () => {
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "benchmark", "validate", "tests/fixtures/benchmarks/login-validation.benchmark.json"],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("benchmark valid: login-validation-001@1.0.0");
    expect(output.stderr()).toBe("");
  });

  test("benchmark validate rejects an invalid fixture", async () => {
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "benchmark", "validate", "tests/fixtures/benchmarks/missing-limits.benchmark.json"],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("benchmark invalid:");
  });

  test("benchmark run executes a benchmark through fake dry-run mode without harness binaries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-run-"));
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness", "benchmark", "run", "--benchmark",
        "tests/fixtures/benchmarks/login-validation.benchmark.json",
        "--harness",
        "codex",
        "--workspace-root",
        dir,
        "--run-id",
        "run_cli",
        "--trial-id",
        "trial_cli",
        "--dry-run"
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("\"status\":\"completed\"");
    expect(output.stdout()).toContain("\"harness\":\"codex\"");
    expect(output.stderr()).toBe("");
  });

  test("benchmark run reports missing process harness configuration outside dry-run mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-run-"));
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness", "benchmark", "run", "--benchmark",
        "tests/fixtures/benchmarks/login-validation.benchmark.json",
        "--harness",
        "claude_code",
        "--workspace-root",
        dir
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(78);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("process harness execution is not configured");
  });

  test("benchmark run executes a configured fake process harness without real Codex or Claude binaries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-process-"));
    const fakeHarnessPath = join(dir, "fake-harness.mjs");
    const capturePath = join(dir, "capture.json");
    const output = createOutput();
    await writeFile(
      fakeHarnessPath,
      `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
await import("node:fs/promises").then(({ writeFile }) => writeFile(process.env.CAPTURE_PATH, JSON.stringify({
  prompt: Buffer.concat(chunks).toString("utf8"),
  runId: process.env.BMH_RUN_ID,
  trialId: process.env.BMH_TRIAL_ID,
  provider: process.env.BMH_PROVIDER
})));
`,
      "utf8"
    );

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness", "benchmark", "run", "--benchmark",
        "tests/fixtures/benchmarks/login-validation.benchmark.json",
        "--harness",
        "codex",
        "--workspace-root",
        join(dir, "workspaces"),
        "--run-id",
        "run_process",
        "--trial-id",
        "trial_process",
        "--harness-command-json",
        JSON.stringify({
          executable: process.execPath,
          args: [fakeHarnessPath],
          env: { CAPTURE_PATH: capturePath }
        })
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    const capture = JSON.parse(await readFile(capturePath, "utf8")) as Record<string, string>;

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("\"mode\":\"process\"");
    expect(output.stdout()).toContain("\"status\":\"completed\"");
    expect(capture).toMatchObject({
      prompt: "Add input validation to the login form.",
      runId: "run_process",
      trialId: "trial_process",
      provider: "codex"
    });
  });

  test("benchmark run can execute benchmark validation commands when requested", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-validation-"));
    const benchmarkPath = join(dir, "benchmark.json");
    const validatorPath = join(dir, "validator.mjs");
    const markerPath = join(dir, "validation-marker.txt");
    const output = createOutput();
    await writeFile(
      validatorPath,
      `
await import("node:fs/promises").then(({ appendFile }) => appendFile(process.argv[2], [
  process.argv[3],
  process.cwd(),
  process.env.BMH_RUN_ID,
  process.env.BMH_TRIAL_ID,
  process.env.BMH_PROVIDER
].join(":") + "\\n"));
process.stdout.write(process.argv[3] + " ok\\n");
`,
      "utf8"
    );
    await writeFile(
      benchmarkPath,
      JSON.stringify({
        id: "validation-cli-001",
        name: "Validation CLI",
        version: "1.0.0",
        category: "smoke",
        repo: {
          url: "file:///tmp/bmh/validation-cli",
          commit: "abc123",
          setup_commands: [`${JSON.stringify(process.execPath)} ${JSON.stringify(validatorPath)} ${JSON.stringify(markerPath)} setup`],
          test_commands: [`${JSON.stringify(process.execPath)} ${JSON.stringify(validatorPath)} ${JSON.stringify(markerPath)} validation`]
        },
        prompt: { text: "Do validation work." },
        expected_output: { tests_must_pass: true },
        limits: { timeout_seconds: 5 },
        evaluation: { scoring: { tests: 1 } }
      }),
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
        "run_validation_cli",
        "--trial-id",
        "trial_validation_cli",
        "--dry-run",
        "--run-validation"
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    const marker = await readFile(markerPath, "utf8");

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("\"status\":\"completed\"");
    expect(marker.split("\n").filter(Boolean)).toEqual([
      `setup:${join(dir, "workspaces", "trial_validation_cli")}:run_validation_cli:trial_validation_cli:codex`,
      `validation:${join(dir, "workspaces", "trial_validation_cli")}:run_validation_cli:trial_validation_cli:codex`
    ]);
  });

  test("report renders a provided JSON report input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-report-"));
    const reportPath = join(dir, "report.json");
    const output = createOutput();
    await writeFile(
      reportPath,
      JSON.stringify({
        run_id: "run_cli",
        status: "completed",
        trials: [{ harness: "codex", status: "completed" }]
      }),
      "utf8"
    );

    const exitCode = await runCli(["node", "bench-my-harness", "report", "--input", reportPath], {
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("Run run_cli");
    expect(output.stdout()).toContain("codex: completed");
    expect(output.stderr()).toBe("");
  });

  test("report states a missing run clearly", async () => {
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "report", "--run-id", "run_missing"], {
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(78);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("run not found: run_missing");
  });

  test("package bin points at the build output CLI main", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
      bin?: Record<string, string>;
    };

    expect(pkg.bin?.["bmh"]).toBe("dist/adapters/inbound/cli/main.js");
    expect(pkg.bin?.["bench-my-harness"]).toBeUndefined();
  });

  test("CLI entrypoint detection accepts npm-style symlinked bins", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-bin-"));
    const target = join(dir, "main.js");
    const link = join(dir, "bmh");
    await writeFile(target, "");
    await symlink(target, link);

    await expect(isCliEntrypoint(pathToFileURL(target).href, link)).resolves.toBe(true);
  });
});

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
