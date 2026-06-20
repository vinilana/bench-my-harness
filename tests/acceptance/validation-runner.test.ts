import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ProcessValidationRunner } from "../../src/adapters/outbound/harnesses/process-validation-runner.js";

describe("validation runner", () => {
  test("executes fake setup and validation commands in the trial workspace and captures output", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-validation-runner-"));
    const commandPath = join(workspace, "fake-command.mjs");
    const markerPath = join(workspace, "marker.txt");
    await writeFile(commandPath, fakeCommandSource(), "utf8");
    const runner = new ProcessValidationRunner();

    const result = await runner.execute({
      runId: "run_validation_adapter",
      trialId: "trial_validation_adapter",
      harness: "codex",
      workspace,
      setupCommands: [fakeCommand(commandPath, "setup", markerPath)],
      validationCommands: [fakeCommand(commandPath, "validation", markerPath)]
    });

    const marker = await readFile(markerPath, "utf8");
    const output = await readFile(join(workspace, result.testOutputPath ?? ""), "utf8");

    expect(result.status).toBe("passed");
    expect(result.testOutputPath).toBe(".bmh/validation-output.txt");
    expect(marker.split("\n").filter(Boolean)).toEqual([
      `setup:${workspace}:run_validation_adapter:trial_validation_adapter:codex`,
      `validation:${workspace}:run_validation_adapter:trial_validation_adapter:codex`
    ]);
    expect(output).toContain("setup stdout");
    expect(output).toContain("setup stderr");
    expect(output).toContain("validation stdout");
    expect(output).toContain("validation stderr");
  });

  test("classifies setup command failures and skips validation commands", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-validation-setup-failure-"));
    const commandPath = join(workspace, "fake-command.mjs");
    const markerPath = join(workspace, "marker.txt");
    await writeFile(commandPath, fakeCommandSource(), "utf8");
    const runner = new ProcessValidationRunner();

    const result = await runner.execute({
      runId: "run_setup_failure",
      trialId: "trial_setup_failure",
      harness: "claude_code",
      workspace,
      setupCommands: [fakeCommand(commandPath, "setup", markerPath, 17)],
      validationCommands: [fakeCommand(commandPath, "validation", markerPath)]
    });

    const marker = await readFile(markerPath, "utf8");

    expect(result).toMatchObject({
      status: "failed",
      failedPhase: "setup",
      exitCode: 17,
      testOutputPath: ".bmh/validation-output.txt"
    });
    expect(marker.split("\n").filter(Boolean)).toEqual([
      `setup:${workspace}:run_setup_failure:trial_setup_failure:claude_code`
    ]);
  });

  test("classifies validation command failures as validation evidence", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-validation-command-failure-"));
    const commandPath = join(workspace, "fake-command.mjs");
    const markerPath = join(workspace, "marker.txt");
    await writeFile(commandPath, fakeCommandSource(), "utf8");
    const runner = new ProcessValidationRunner();

    const result = await runner.execute({
      runId: "run_validation_failure",
      trialId: "trial_validation_failure",
      harness: "codex",
      workspace,
      setupCommands: [],
      validationCommands: [fakeCommand(commandPath, "validation", markerPath, 5)]
    });

    expect(result).toMatchObject({
      status: "failed",
      failedPhase: "validation",
      exitCode: 5,
      testOutputPath: ".bmh/validation-output.txt"
    });
  });
});

function fakeCommand(commandPath: string, phase: string, markerPath: string, exitCode = 0): string {
  return [
    JSON.stringify(process.execPath),
    JSON.stringify(commandPath),
    JSON.stringify(phase),
    JSON.stringify(markerPath),
    String(exitCode)
  ].join(" ");
}

function fakeCommandSource(): string {
  return `
import { appendFile } from "node:fs/promises";

const [phase, markerPath, exitCode] = process.argv.slice(2);
await appendFile(
  markerPath,
  [phase, process.cwd(), process.env.BMH_RUN_ID, process.env.BMH_TRIAL_ID, process.env.BMH_PROVIDER].join(":") + "\\n"
);
process.stdout.write(phase + " stdout\\n");
process.stderr.write(phase + " stderr\\n");
process.exitCode = Number(exitCode);
`;
}
