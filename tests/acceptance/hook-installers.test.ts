import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CodexHookInstaller } from "../../src/adapters/outbound/harnesses/codex/codex-hook-installer.js";
import { ClaudeCodeHookInstaller } from "../../src/adapters/outbound/harnesses/claude-code/claude-code-hook-installer.js";

describe("hook installers", () => {
  test("Codex installer writes project-local hooks only inside the trial workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-codex-"));
    const installer = new CodexHookInstaller();

    const installation = await installer.install({
      workspace,
      runId: "run_1",
      trialId: "trial_1",
      spoolPath: join(workspace, ".bmh", "events.jsonl")
    });

    expect(installation.files.every((file: string) => file.startsWith(workspace))).toBe(true);

    const hooks = await readFile(join(workspace, ".codex", "hooks.json"), "utf8");
    expect(hooks).toContain("bench-my-harness' hook-capture --provider codex");
    expect(hooks).toContain("PreToolUse");
    expect(hooks).toContain("PostToolUse");
    expect(hooks).toContain("Stop");
  });

  test("Claude Code installer writes project-local hooks only inside the trial workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-claude-"));
    const installer = new ClaudeCodeHookInstaller();

    const installation = await installer.install({
      workspace,
      runId: "run_1",
      trialId: "trial_1",
      spoolPath: join(workspace, ".bmh", "events.jsonl")
    });

    expect(installation.files.every((file: string) => file.startsWith(workspace))).toBe(true);

    const settings = await readFile(join(workspace, ".claude", "settings.local.json"), "utf8");
    expect(settings).toContain("bench-my-harness' hook-capture --provider claude_code");
    expect(settings).toContain("PreToolUse");
    expect(settings).toContain("PermissionRequest");
    expect(settings).toContain("SessionEnd");
  });

  test("uninstall removes generated files without deleting unrelated user files", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-uninstall-"));
    const unrelated = join(workspace, ".codex", "keep.json");
    const installer = new CodexHookInstaller();
    const installation = await installer.install({
      workspace,
      runId: "run_1",
      trialId: "trial_1",
      spoolPath: join(workspace, ".bmh", "events.jsonl")
    });
    await writeFile(unrelated, "{}");

    await installer.uninstall(installation);

    await expect(readFile(unrelated, "utf8")).resolves.toBe("{}");
  });
});
