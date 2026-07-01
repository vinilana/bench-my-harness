import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ProcessHarnessRunner } from "../../src/adapters/outbound/harnesses/process-harness-runner.js";

describe("process harness runner", () => {
  test("passes prompt exactly with workspace cwd, env metadata, and timeout", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-process-runner-"));
    const capturePath = join(workspace, "capture.json");
    const fakeHarnessPath = join(workspace, "fake-harness.mjs");
    await writeFile(
      fakeHarnessPath,
      `
const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
await import("node:fs/promises").then(({ writeFile }) => writeFile(process.env.CAPTURE_PATH, JSON.stringify({
  prompt: Buffer.concat(chunks).toString("utf8"),
  cwd: process.cwd(),
  env: {
    BMH_RUN_ID: process.env.BMH_RUN_ID,
    BMH_TRIAL_ID: process.env.BMH_TRIAL_ID,
    BMH_PROVIDER: process.env.BMH_PROVIDER,
    BMH_SPOOL_PATH: process.env.BMH_SPOOL_PATH
  }
})));
process.stdout.write("fake harness complete");
`,
      "utf8"
    );
    const prompt = "Line 1\nLine 2\ntrailing spaces  ";
    const runner = new ProcessHarnessRunner({
      codex: {
        executable: process.execPath,
        args: [fakeHarnessPath],
        promptDelivery: "stdin"
      }
    });

    const result = await runner.execute({
      harness: "codex",
      prompt,
      workspace,
      runId: "run_123",
      trialId: "trial_456",
      env: {
        CAPTURE_PATH: capturePath,
        BMH_RUN_ID: "run_123",
        BMH_TRIAL_ID: "trial_456",
        BMH_PROVIDER: "codex",
        BMH_SPOOL_PATH: join(workspace, ".bmh", "hooks.jsonl")
      },
      timeoutSeconds: 5
    });

    const capture = JSON.parse(await readFile(capturePath, "utf8")) as {
      prompt: string;
      cwd: string;
      env: Record<string, string>;
    };

    expect(result).toMatchObject({
      exitCode: 0,
      timedOut: false,
      stdout: "fake harness complete"
    });
    expect(capture.prompt).toBe(prompt);
    expect(capture.cwd).toBe(workspace);
    expect(capture.env).toMatchObject({
      BMH_RUN_ID: "run_123",
      BMH_TRIAL_ID: "trial_456",
      BMH_PROVIDER: "codex",
      BMH_SPOOL_PATH: join(workspace, ".bmh", "hooks.jsonl")
    });
  });

  test("returns a timeout result that benchmark runner can classify", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-process-timeout-"));
    const fakeHarnessPath = join(workspace, "fake-slow-harness.mjs");
    await writeFile(
      fakeHarnessPath,
      "setTimeout(() => process.stdout.write('too late'), 1000);",
      "utf8"
    );
    const runner = new ProcessHarnessRunner({
      claude_code: {
        executable: process.execPath,
        args: [fakeHarnessPath],
        promptDelivery: "stdin"
      }
    });

    const result = await runner.execute({
      harness: "claude_code",
      prompt: "do the work",
      workspace,
      runId: "run_timeout",
      trialId: "trial_timeout",
      env: {},
      timeoutSeconds: 0.05
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(true);
  });

  test("classifies Claude Code session limit failures as environment failures", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-process-claude-limit-"));
    const fakeHarnessPath = join(workspace, "fake-claude-limit.mjs");
    await writeFile(
      fakeHarnessPath,
      "process.stdout.write(\"You've hit your session limit · resets 10:50pm (America/Sao_Paulo)\\n\"); process.exit(1);",
      "utf8"
    );
    const runner = new ProcessHarnessRunner({
      claude_code: {
        executable: process.execPath,
        args: [fakeHarnessPath],
        promptDelivery: "stdin"
      }
    });

    const result = await runner.execute({
      harness: "claude_code",
      prompt: "do the work",
      workspace,
      runId: "run_claude_limit",
      trialId: "trial_claude_limit",
      env: {},
      timeoutSeconds: 5
    });

    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(result.failureClassification).toBe("environment_failed");
  });
});
