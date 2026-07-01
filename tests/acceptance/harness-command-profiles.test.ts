import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";
import {
  createOutput,
  createSpec19Workspace,
  readJson,
  withProcessPath,
  writeNodeExecutable
} from "../support/spec19-fixtures.js";

describe("real harness command profiles", () => {
  test("Codex profile uses codex exec with stdin prompt delivery and workspace-safe defaults", async () => {
    const workspace = await createSpec19Workspace({ prefix: "bmh-codex-profile-" });
    const fakeBin = join(workspace.cwd, "fake-bin");
    const output = createOutput();

    await writeRecordingHarness(join(fakeBin, "codex"));

    const exitCode = await withProcessPath([fakeBin], () =>
      runCli(
        [
          "node",
          "bench-my-harness",
          "run",
          "--real",
          "--catalog-root",
          workspace.catalogRoot,
          "--store-root",
          workspace.storeRoot,
          "--workspace-root",
          workspace.workspaceRoot,
          "--run-id",
          "run_spec19_codex_profile",
          "--harness",
          "codex",
          "--trials",
          "1"
        ],
        { cwd: workspace.cwd, stdout: output.stdout, stderr: output.stderr, env: { ...process.env } }
      )
    );

    const capture = await readJson<{ argv: string[]; prompt: string }>(
      join(workspace.workspaceRoot, workspace.trialId, ".bmh", "profile-capture.json")
    );

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(capture.argv[0]).toBe("exec");
    expect(capture.argv).toContain("-");
    expect(capture.argv).toContain("--skip-git-repo-check");
    expect(capture.argv).toEqual(expect.arrayContaining(["--sandbox", "workspace-write"]));
    expect(capture.argv).toContain("--dangerously-bypass-hook-trust");
    expect(capture.argv).not.toContain("--ask-for-approval");
    expect(capture.prompt).toBe("Generate the project commands without leaking secrets.\n");
  });

  test("Claude Code profile exposes a v1 command contract or a clear unsupported capability status", async () => {
    const workspace = await createSpec19Workspace({
      prefix: "bmh-claude-profile-",
      harnesses: ["claude_code"]
    });
    const fakeBin = join(workspace.cwd, "fake-bin");
    const output = createOutput();
    const claudeTrialId = `${workspace.specId}_claude_code_trial_1`;

    await writeRecordingHarness(join(fakeBin, "claude"));
    await writeRecordingHarness(join(fakeBin, "claude-code"));

    const exitCode = await withProcessPath([fakeBin], () =>
      runCli(
        [
          "node",
          "bench-my-harness",
          "run",
          "--real",
          "--catalog-root",
          workspace.catalogRoot,
          "--store-root",
          workspace.storeRoot,
          "--workspace-root",
          workspace.workspaceRoot,
          "--run-id",
          "run_spec19_claude_profile",
          "--harness",
          "claude_code",
          "--trials",
          "1"
        ],
        { cwd: workspace.cwd, stdout: output.stdout, stderr: output.stderr, env: { ...process.env } }
      )
    );

    if (exitCode === 0) {
      const capture = await readJson<{ argv: string[]; prompt: string }>(
        join(workspace.workspaceRoot, claudeTrialId, ".bmh", "profile-capture.json")
      );

      expect(output.stderr()).toBe("");
      expect(capture.argv.length).toBeGreaterThan(0);
      expect(capture.argv).toEqual(expect.arrayContaining(["-p", "--output-format", "json"]));
      expect(capture.prompt).toBe("Generate the project commands without leaking secrets.\n");
      return;
    }

    expect(exitCode).toBe(78);
    expect(output.stdout()).toBe("");
    const stderr = output.stderr() ?? "";
    expect(stderr).toContain("claude_code");
    expect(stderr.toLowerCase()).toMatch(/unsupported|capability|not configured/);
  });
});

async function writeRecordingHarness(path: string): Promise<void> {
  await writeNodeExecutable(
    path,
    `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { mkdir, writeFile } = await import("node:fs/promises");
await mkdir(".bmh", { recursive: true });
await writeFile(".bmh/profile-capture.json", JSON.stringify({
  argv: process.argv.slice(2),
  prompt: Buffer.concat(chunks).toString("utf8")
}, null, 2));
process.stdout.write("profile harness complete\\n");
`
  );
}
