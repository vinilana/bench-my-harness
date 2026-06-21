import { mkdir, stat } from "node:fs/promises";
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

describe("CLI spec real harness suite execution", () => {
  test("specs run --real --harness codex wires a process harness runner for suite execution", async () => {
    const workspace = await createSpec19Workspace({ prefix: "bmh-cli-real-run-" });
    const fakeBin = join(workspace.cwd, "fake-bin");
    const output = createOutput();

    await writeNodeExecutable(
      join(fakeBin, "codex"),
      `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { mkdir, writeFile } = await import("node:fs/promises");
await mkdir(".bmh", { recursive: true });
await writeFile(".bmh/fake-process-capture.json", JSON.stringify({
  argv: process.argv.slice(1),
  prompt: Buffer.concat(chunks).toString("utf8"),
  runId: process.env.BMH_RUN_ID,
  trialId: process.env.BMH_TRIAL_ID,
  provider: process.env.BMH_PROVIDER
}, null, 2));
process.stdout.write("fake codex completed\\n");
`
    );

    const exitCode = await withProcessPath([fakeBin], () =>
      runCli(
        [
          "node",
          "bench-my-harness",
          "specs",
          "run",
          "--real",
          "--catalog-root",
          workspace.catalogRoot,
          "--store-root",
          workspace.storeRoot,
          "--workspace-root",
          workspace.workspaceRoot,
          "--run-id",
          "run_spec19_real_cli",
          "--harness",
          "codex",
          "--trials",
          "1"
        ],
        { cwd: workspace.cwd, stdout: output.stdout, stderr: output.stderr, env: { ...process.env } }
      )
    );

    const capture = await readJson<{
      argv: string[];
      prompt: string;
      runId: string;
      trialId: string;
      provider: string;
    }>(join(workspace.workspaceRoot, workspace.trialId, ".bmh", "fake-process-capture.json"));

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("spec suite run complete: run_spec19_real_cli (1 trials)");
    expect(capture).toMatchObject({
      prompt: "Generate the project commands without leaking secrets.\n",
      runId: "run_spec19_real_cli",
      trialId: workspace.trialId,
      provider: "codex"
    });
  });

  test("specs run --real --dry-run is rejected before loading a harness", async () => {
    const workspace = await createSpec19Workspace({ prefix: "bmh-cli-real-dry-run-" });
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "specs",
        "run",
        "--real",
        "--dry-run",
        "--catalog-root",
        workspace.catalogRoot,
        "--run-id",
        "run_spec19_conflicting_modes",
        "--harness",
        "codex"
      ],
      { cwd: workspace.cwd, stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("cannot use --real and --dry-run together");
  });

  test("missing built-in harness executable fails before trial execution with a clear error", async () => {
    const workspace = await createSpec19Workspace({ prefix: "bmh-cli-real-missing-" });
    const emptyBin = join(workspace.cwd, "empty-bin");
    const output = createOutput();
    const originalPath = process.env.PATH;
    await mkdir(emptyBin, { recursive: true });
    process.env.PATH = emptyBin;

    try {
      const exitCode = await runCli(
        [
          "node",
          "bench-my-harness",
          "specs",
          "run",
          "--real",
          "--catalog-root",
          workspace.catalogRoot,
          "--store-root",
          workspace.storeRoot,
          "--workspace-root",
          workspace.workspaceRoot,
          "--run-id",
          "run_spec19_missing_codex",
          "--harness",
          "codex",
          "--trials",
          "1"
        ],
        { cwd: workspace.cwd, stdout: output.stdout, stderr: output.stderr, env: { ...process.env } }
      );

      expect(exitCode).toBe(78);
      expect(output.stdout()).toBe("");
      const stderr = output.stderr() ?? "";
      expect(stderr.toLowerCase()).toContain("codex");
      expect(stderr.toLowerCase()).toContain("executable");
      await expect(stat(join(workspace.workspaceRoot, workspace.trialId))).rejects.toThrow();
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
    }
  });

  test("--harness-command-json overrides the built-in profile per harness in suite mode", async () => {
    const workspace = await createSpec19Workspace({ prefix: "bmh-cli-real-override-" });
    const fakeHarnessPath = join(workspace.cwd, "fake-override-harness.mjs");
    const capturePath = join(workspace.cwd, "override-capture.json");
    const output = createOutput();

    await writeNodeExecutable(
      fakeHarnessPath,
      `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
await import("node:fs/promises").then(({ writeFile }) => writeFile(process.env.CAPTURE_PATH, JSON.stringify({
  argv: process.argv.slice(1),
  prompt: Buffer.concat(chunks).toString("utf8"),
  cwd: process.cwd(),
  provider: process.env.BMH_PROVIDER
}, null, 2)));
`
    );

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "specs",
        "run",
        "--real",
        "--catalog-root",
        workspace.catalogRoot,
        "--store-root",
        workspace.storeRoot,
        "--workspace-root",
        workspace.workspaceRoot,
        "--run-id",
        "run_spec19_override",
        "--harness",
        "codex",
        "--trials",
        "1",
        "--harness-command-json",
        JSON.stringify({
          codex: {
            executable: process.execPath,
            args: [fakeHarnessPath, "--profile", "override"],
            env: { CAPTURE_PATH: capturePath }
          }
        })
      ],
      { cwd: workspace.cwd, stdout: output.stdout, stderr: output.stderr }
    );

    const capture = await readJson<{ argv: string[]; prompt: string; cwd: string; provider: string }>(capturePath);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(capture.argv).toEqual([fakeHarnessPath, "--profile", "override"]);
    expect(capture.prompt).toBe("Generate the project commands without leaking secrets.\n");
    expect(capture.cwd).toBe(join(workspace.workspaceRoot, workspace.trialId));
    expect(capture.provider).toBe("codex");
  });
});
