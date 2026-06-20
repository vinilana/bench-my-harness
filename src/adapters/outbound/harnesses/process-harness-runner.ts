import { spawn } from "node:child_process";
import type {
  HarnessName,
  HarnessRunnerInput,
  HarnessRunnerPort,
  HarnessRunnerResult
} from "../../../application/ports/harness-runner-port.js";
import type { HarnessCommand } from "../../../domain/harnesses/harness-profile.js";

const TIMEOUT_EXIT_CODE = 124;

export class ProcessHarnessRunner implements HarnessRunnerPort {
  public constructor(
    private readonly commands: Partial<Record<HarnessName, HarnessCommand>>
  ) {}

  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    const command = this.commands[input.harness];

    if (!command) {
      return {
        exitCode: 127,
        stderr: `No process command configured for harness: ${input.harness}`,
        timedOut: false
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
      resolve({
        exitCode: 127,
        stdout: bufferToString(stdoutChunks),
        stderr: error.message,
        timedOut
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
        stderr: bufferToString(stderrChunks),
        timedOut
      });
    });

    child.stdin.end(input.prompt);
  });
}

function bufferToString(chunks: readonly Buffer[]): string {
  return Buffer.concat(chunks).toString("utf8");
}
