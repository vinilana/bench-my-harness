import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";
import {
  createOutput,
  createSpec19Workspace,
  writeNodeExecutable
} from "../support/spec19-fixtures.js";

describe("real spec suite progress output", () => {
  test("emits safe start and completion lines with duration and hook count per real trial", async () => {
    const secretPrompt = "PROMPT_SECRET_DO_NOT_PRINT: generate project commands.";
    const workspace = await createSpec19Workspace({
      prefix: "bmh-spec-suite-progress-",
      prompt: secretPrompt
    });
    const fakeHarnessPath = join(workspace.cwd, "fake-progress-harness.mjs");
    const output = createOutput();

    await writeNodeExecutable(
      fakeHarnessPath,
      `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { appendFile } = await import("node:fs/promises");
for (const event of ["SessionStart", "UserPromptSubmit", "Stop"]) {
  await appendFile(process.env.BMH_SPOOL_PATH, JSON.stringify({ event }) + "\\n");
}
process.stdout.write("fake progress harness complete\\n");
`
    );

    const exitCode = await runCli(
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
        "run_spec19_progress",
        "--harness",
        "codex",
        "--trials",
        "1",
        "--harness-command-json",
        JSON.stringify({
          codex: {
            executable: process.execPath,
            args: [fakeHarnessPath]
          }
        })
      ],
      { cwd: workspace.cwd, stdout: output.stdout, stderr: output.stderr }
    );

    const stdout = output.stdout();
    const stderr = output.stderr();

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain(`starting trial 1/1: ${workspace.specId} codex`);
    expect(stdout).toContain(`trial completed: ${workspace.specId} codex completed`);
    expect(stdout).toContain("hooks=3");
    expect(stdout).toMatch(/duration=[0-9]+/);
    expect(stdout).not.toContain(secretPrompt);
    expect(stderr).not.toContain(secretPrompt);
  });
});
