import { spawn } from "node:child_process";
import type {
  HarnessName,
  HarnessRunnerInput,
  HarnessRunnerPort,
  HarnessRunnerResult
} from "../../../application/ports/harness-runner-port.js";
import type { HarnessCommand } from "../../../domain/harnesses/harness-profile.js";
import { checkHarnessCommandAvailability } from "./harness-command-profiles.js";

const TIMEOUT_EXIT_CODE = 124;

export class ProcessHarnessRunner implements HarnessRunnerPort {
  public constructor(
    private readonly commands: Partial<Record<HarnessName, HarnessCommand>>
  ) {}

  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    const command = this.commands[input.harness];

    if (!command) {
      const now = new Date().toISOString();
      return {
        exitCode: 127,
        stderr: `No process command configured for harness: ${input.harness}`,
        timedOut: false,
        failureClassification: "environment_failed",
        processDiagnostics: {
          stdout: "",
          stderr: `No process command configured for harness: ${input.harness}`,
          exit: {
            executable: "",
            args: [],
            exit_code: 127,
            timed_out: false,
            started_at: now,
            ended_at: now,
            duration_ms: 0
          }
        }
      };
    }

    const availability = await checkHarnessCommandAvailability(command, {
      ...process.env,
      ...(command.env ?? {}),
      ...input.env
    });

    if (!availability.available) {
      const now = new Date().toISOString();
      return {
        exitCode: 127,
        stderr: availability.message,
        timedOut: false,
        failureClassification: "environment_failed",
        processDiagnostics: {
          stdout: "",
          stderr: availability.message,
          exit: {
            executable: command.executable,
            args: [...(command.args ?? [])],
            exit_code: 127,
            timed_out: false,
            started_at: now,
            ended_at: now,
            duration_ms: 0
          }
        }
      };
    }

    return executeProcess(command, input);
  }
}

function executeProcess(
  command: HarnessCommand,
  input: HarnessRunnerInput
): Promise<HarnessRunnerResult> {
  return new Promise((resolve) => {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const child = spawn(command.executable, [...(command.args ?? [])], {
      cwd: input.workspace,
      env: {
        ...process.env,
        ...(command.env ?? {}),
        ...input.env
      },
      stdio: ["pipe", "pipe", "pipe"]
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
      const stderr = error.message;
      resolve({
        exitCode: 127,
        stdout: bufferToString(stdoutChunks),
        stderr,
        timedOut,
        failureClassification: "environment_failed",
        processDiagnostics: diagnosticsFor({
          command,
          exitCode: 127,
          timedOut,
          startedAt,
          startedAtMs,
          stdout: bufferToString(stdoutChunks),
          stderr
        })
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
      const exitCode = timedOut ? TIMEOUT_EXIT_CODE : code ?? 1;
      const stdout = bufferToString(stdoutChunks);
      const stderr = bufferToString(stderrChunks);
      resolve({
        exitCode,
        stdout,
        stderr,
        timedOut,
        failureClassification: timedOut ? "timeout" : undefined,
        processDiagnostics: diagnosticsFor({
          command,
          exitCode,
          timedOut,
          startedAt,
          startedAtMs,
          stdout,
          stderr
        })
      });
    });

    child.stdin.end(input.prompt);
  });
}

function diagnosticsFor(input: {
  command: HarnessCommand;
  exitCode: number;
  timedOut: boolean;
  startedAt: string;
  startedAtMs: number;
  stdout: string;
  stderr: string;
}): NonNullable<HarnessRunnerResult["processDiagnostics"]> {
  const endedAtMs = Date.now();

  return {
    stdout: input.stdout,
    stderr: input.stderr,
    exit: {
      executable: input.command.executable,
      args: [...(input.command.args ?? [])],
      exit_code: input.exitCode,
      timed_out: input.timedOut,
      started_at: input.startedAt,
      ended_at: new Date(endedAtMs).toISOString(),
      duration_ms: Math.max(0, endedAtMs - input.startedAtMs)
    }
  };
}

function bufferToString(chunks: readonly Buffer[]): string {
  return Buffer.concat(chunks).toString("utf8");
}
