import { readFile } from "node:fs/promises";
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

describe("real suite hook command resolution", () => {
  test("real runs make bmh internal hook-capture resolvable without global installation", async () => {
    const workspace = await createSpec19Workspace({ prefix: "bmh-hook-command-resolution-" });
    const fakeBin = join(workspace.cwd, "fake-bin");
    const output = createOutput();

    await writeNodeExecutable(
      join(fakeBin, "codex"),
      `
const { spawnSync } = await import("node:child_process");
const { access, mkdir, writeFile } = await import("node:fs/promises");
const hookPayload = JSON.stringify({ transcript_path: "transcript.jsonl", event: "Stop", api_key: "sk-test-1234567890" });
const hook = spawnSync("bmh", [
  "internal",
  "hook-capture",
  "--provider",
  "codex",
  "--event",
  "Stop",
  "--run-id",
  process.env.BMH_RUN_ID,
  "--trial-id",
  process.env.BMH_TRIAL_ID,
  "--event-source",
  "stdin",
  "--spool",
  process.env.BMH_SPOOL_PATH
], { input: hookPayload, encoding: "utf8" });
const pathEntries = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":");
await mkdir(".bmh", { recursive: true });
await writeFile(".bmh/hook-resolution-capture.json", JSON.stringify({
  status: hook.status,
  error: hook.error?.message,
  stdout: hook.stdout,
  stderr: hook.stderr,
  pathEntries,
  pathHasLocalShim: pathEntries.some((entry) => entry.includes(".bmh")),
  bmhShimExists: await exists(".bmh/bin/bmh")
}, null, 2));
if (hook.error || hook.status !== 0) {
  process.exit(1);
}
process.stdout.write("hook resolution complete\\n");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
`
    );

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
          "run_spec19_hook_resolution",
          "--harness",
          "codex",
          "--trials",
          "1"
        ],
        { cwd: workspace.cwd, stdout: output.stdout, stderr: output.stderr, env: { ...process.env } }
      )
    );

    const trialDir = join(workspace.workspaceRoot, workspace.trialId);
    const capture = await readJson<{
      status: number;
      error?: string;
      pathHasLocalShim: boolean;
      bmhShimExists: boolean;
    }>(join(trialDir, ".bmh", "hook-resolution-capture.json"));

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(capture).toMatchObject({
      status: 0,
      pathHasLocalShim: true,
      bmhShimExists: true
    });
    expect(capture.error).toBeUndefined();

    const [spoolLine] = (await readFile(join(trialDir, ".bmh", "hooks.jsonl"), "utf8")).trim().split("\n");
    expect(spoolLine).not.toContain("sk-test-1234567890");
    expect(spoolLine).toContain("[REDACTED]");
    const hookEvent = JSON.parse(spoolLine) as Record<string, unknown>;
    const result = await readJson<Record<string, unknown>>(
      join(workspace.storeRoot, "run_spec19_hook_resolution", "specs", workspace.specId, "codex", workspace.trialId, "result.json")
    );

    expect(hookEvent).toMatchObject({
      provider: "codex",
      run_id: "run_spec19_hook_resolution",
      trial_id: workspace.trialId
    });
    expect(JSON.stringify(result)).toContain("hook_command");
  });
});
