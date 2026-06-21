import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";
import {
  createOutput,
  createSpec19Workspace,
  readJson,
  writeNodeExecutable
} from "../support/spec19-fixtures.js";

describe("real process trial diagnostics", () => {
  test("captures stdout, process exit metadata, and diagnostics links for successful trials", async () => {
    const workspace = await createSpec19Workspace({ prefix: "bmh-process-diagnostics-success-" });
    const fakeHarnessPath = join(workspace.cwd, "fake-success-harness.mjs");
    const output = createOutput();

    await writeNodeExecutable(
      fakeHarnessPath,
      `
await import("node:fs/promises").then(({ appendFile }) => appendFile(
  process.env.BMH_SPOOL_PATH,
  JSON.stringify({ event: "Stop", transcript_path: "transcript.jsonl" }) + "\\n"
));
process.stdout.write("fake stdout diagnostic\\n");
process.stderr.write("fake stderr diagnostic\\n");
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
        "run_spec19_process_diagnostics_success",
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

    const trialArtifactDir = join(
      workspace.storeRoot,
      "run_spec19_process_diagnostics_success",
      "specs",
      workspace.specId,
      "codex",
      workspace.trialId
    );
    const processExit = await readJson<{
      executable: string;
      args: string[];
      exit_code: number;
      timed_out: boolean;
      started_at: string;
      ended_at: string;
      duration_ms: number;
    }>(join(trialArtifactDir, "process-exit.json"));
    const result = await readJson<Record<string, unknown>>(join(trialArtifactDir, "result.json"));
    const reportHtml = await readFile(join(workspace.storeRoot, "run_spec19_process_diagnostics_success", "report.html"), "utf8");

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    await expect(readFile(join(trialArtifactDir, "process-stdout.txt"), "utf8")).resolves.toContain("fake stdout diagnostic");
    await expect(readFile(join(trialArtifactDir, "process-stderr.txt"), "utf8")).resolves.toContain("fake stderr diagnostic");
    expect(processExit).toMatchObject({
      executable: process.execPath,
      args: [fakeHarnessPath],
      exit_code: 0,
      timed_out: false
    });
    expect(Date.parse(processExit.started_at)).not.toBeNaN();
    expect(Date.parse(processExit.ended_at)).not.toBeNaN();
    expect(processExit.duration_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(result)).toContain("process-stdout.txt");
    expect(JSON.stringify(result)).toContain("process-stderr.txt");
    expect(JSON.stringify(result)).toContain("process-exit.json");
    expect(reportHtml).toContain("process-stdout.txt");
    expect(reportHtml).toContain("process-stderr.txt");
    expect(reportHtml).toContain("process-exit.json");
  });

  test("captures stderr for failed trials and records non-zero harness exit diagnostics", async () => {
    const workspace = await createSpec19Workspace({ prefix: "bmh-process-diagnostics-failure-" });
    const fakeHarnessPath = join(workspace.cwd, "fake-failing-harness.mjs");
    const output = createOutput();

    await writeNodeExecutable(
      fakeHarnessPath,
      `
process.stdout.write("stdout before failure\\n");
process.stderr.write("fake failure detail\\n");
process.exit(7);
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
        "run_spec19_process_diagnostics_failure",
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

    const trialArtifactDir = join(
      workspace.storeRoot,
      "run_spec19_process_diagnostics_failure",
      "specs",
      workspace.specId,
      "codex",
      workspace.trialId
    );
    const processExit = await readJson<{ exit_code: number; timed_out: boolean }>(
      join(trialArtifactDir, "process-exit.json")
    );
    const result = await readJson<{ status: string; failure_classification: string }>(join(trialArtifactDir, "result.json"));

    expect(exitCode).toBe(0);
    await expect(readFile(join(trialArtifactDir, "process-stderr.txt"), "utf8")).resolves.toContain("fake failure detail");
    expect(processExit).toMatchObject({ exit_code: 7, timed_out: false });
    expect(result).toMatchObject({ status: "failed", failure_classification: "agent_failed" });
  });

  test("classifies failed executable lookup as environment_failed", async () => {
    const workspace = await createSpec19Workspace({ prefix: "bmh-process-diagnostics-missing-" });
    const output = createOutput();

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
        "run_spec19_process_diagnostics_missing",
        "--harness",
        "codex",
        "--trials",
        "1",
        "--harness-command-json",
        JSON.stringify({
          codex: {
            executable: join(workspace.cwd, "missing-harness-binary"),
            args: ["exec", "-"]
          }
        })
      ],
      { cwd: workspace.cwd, stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(78);
    expect(output.stdout()).toBe("");
    const stderr = output.stderr() ?? "";
    expect(stderr.toLowerCase()).toContain("environment_failed");
    expect(stderr.toLowerCase()).toContain("missing-harness-binary");
  });
});
