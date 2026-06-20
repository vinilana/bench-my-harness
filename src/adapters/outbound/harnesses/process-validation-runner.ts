import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type {
  ValidationCommandPhase,
  ValidationRunnerInput,
  ValidationRunnerPort,
  ValidationRunnerResult
} from "../../../application/ports/validation-runner-port.js";

const TEST_OUTPUT_PATH = ".bmh/validation-output.txt";
const TIMEOUT_EXIT_CODE = 124;

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class ProcessValidationRunner implements ValidationRunnerPort {
  public async execute(input: ValidationRunnerInput): Promise<ValidationRunnerResult> {
    const outputPath = join(input.workspace, TEST_OUTPUT_PATH);
    const outputChunks: string[] = [];
    await mkdir(join(input.workspace, ".bmh"), { recursive: true });

    for (const command of input.setupCommands) {
      const result = await executeCommand(command, input);
      outputChunks.push(formatCommandOutput("setup", result));

      if (result.exitCode !== 0) {
        await writeFile(outputPath, outputChunks.join(""), "utf8");
        return failedResult("setup", result.exitCode);
      }
    }

    for (const command of input.validationCommands) {
      const result = await executeCommand(command, input);
      outputChunks.push(formatCommandOutput("validation", result));

      if (result.exitCode !== 0) {
        await writeFile(outputPath, outputChunks.join(""), "utf8");
        return failedResult("validation", result.exitCode);
      }
    }

    await writeFile(outputPath, outputChunks.join(""), "utf8");
    return {
      status: "passed",
      testOutputPath: TEST_OUTPUT_PATH
    };
  }
}

function failedResult(failedPhase: ValidationCommandPhase, exitCode: number): ValidationRunnerResult {
  return {
    status: "failed",
    failedPhase,
    exitCode,
    testOutputPath: TEST_OUTPUT_PATH
  };
}

function executeCommand(command: string, input: ValidationRunnerInput): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: input.workspace,
      env: {
        ...process.env,
        BMH_RUN_ID: input.runId,
        BMH_TRIAL_ID: input.trialId,
        BMH_HARNESS: input.harness,
        BMH_PROVIDER: input.harness
      },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const timeout = input.timeoutSeconds === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, Math.max(1, input.timeoutSeconds * 1000));

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({
        exitCode: 127,
        stdout: bufferToString(stdoutChunks),
        stderr: error.message
      });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({
        exitCode: timedOut ? TIMEOUT_EXIT_CODE : code ?? 1,
        stdout: bufferToString(stdoutChunks),
        stderr: bufferToString(stderrChunks)
      });
    });
  });
}

function formatCommandOutput(phase: ValidationCommandPhase, result: CommandResult): string {
  return [
    `[${phase}_command]`,
    "[stdout]",
    result.stdout,
    "[stderr]",
    result.stderr,
    `[exit_code] ${result.exitCode}`,
    ""
  ].join("\n");
}

function bufferToString(chunks: readonly Buffer[]): string {
  return Buffer.concat(chunks).toString("utf8");
}
