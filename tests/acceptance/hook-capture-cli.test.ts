import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHookCapture } from "../../src/adapters/inbound/cli/hook-capture.js";
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };
import secretEvent from "../fixtures/security/secret-bearing-event.json" with { type: "json" };

describe("hook-capture CLI", () => {
  test("reads one hook event from stdin and writes it to the spool", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-hook-"));
    const spool = join(dir, "events.jsonl");

    const result = await runHookCapture({
      provider: "codex",
      event: "PreToolUse",
      runId: "run_1",
      trialId: "trial_1",
      stdin: JSON.stringify(codexPreToolUse),
      spoolPath: spool,
      strict: false
    });

    expect(result.exitCode).toBe(0);
    expect((await stat(spool)).size).toBeGreaterThan(0);
  });

  test("redacts known secrets before reportable persistence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-hook-"));
    const spool = join(dir, "events.jsonl");

    await runHookCapture({
      provider: "claude_code",
      event: "PreToolUse",
      runId: "run_1",
      trialId: "trial_1",
      stdin: JSON.stringify(secretEvent),
      spoolPath: spool,
      strict: false
    });

    const content = await readFile(spool, "utf8");
    expect(content).not.toContain("sk-test-1234567890");
    expect(content).not.toContain("secret-token");
    expect(content).toContain("[REDACTED]");
  });

  test("fails in strict mode when persistence fails", async () => {
    const result = await runHookCapture({
      provider: "codex",
      event: "PreToolUse",
      runId: "run_1",
      trialId: "trial_1",
      stdin: JSON.stringify(codexPreToolUse),
      spoolPath: "/path/that/does/not/exist/events.jsonl",
      strict: true
    });

    expect(result.exitCode).not.toBe(0);
  });
});
