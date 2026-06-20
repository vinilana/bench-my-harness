import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/adapters/inbound/cli/main.js";
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };

describe("public CLI surface", () => {
  test("hook-capture parses flags, reads stdin, and writes the spool", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-hook-"));
    const spool = join(dir, "events.jsonl");
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "hook-capture",
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

  test("validate benchmark accepts a valid fixture", async () => {
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "validate", "benchmark", "tests/fixtures/benchmarks/login-validation.benchmark.json"],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("benchmark valid: login-validation-001@1.0.0");
    expect(output.stderr()).toBe("");
  });

  test("validate benchmark rejects an invalid fixture", async () => {
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "validate", "benchmark", "tests/fixtures/benchmarks/missing-limits.benchmark.json"],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("benchmark invalid:");
  });

  test("run executes a benchmark through fake dry-run mode without harness binaries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-run-"));
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "run",
        "--benchmark",
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

  test("run reports missing process harness configuration outside dry-run mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-cli-run-"));
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "run",
        "--benchmark",
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

  test("run executes a configured fake process harness without real Codex or Claude binaries", async () => {
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
        "bench-my-harness",
        "run",
        "--benchmark",
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

    expect(pkg.bin?.["bench-my-harness"]).toBe("./dist/adapters/inbound/cli/main.js");
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
