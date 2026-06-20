#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { z } from "zod";
import { BenchmarkRunner } from "../../../application/use-cases/run-benchmark.js";
import type { ArtifactCollectorPort } from "../../../application/ports/artifact-collector-port.js";
import type { HarnessRunnerPort } from "../../../application/ports/harness-runner-port.js";
import type { InstallHarnessHooksPort } from "../../../application/ports/install-harness-hooks-port.js";
import { ClaudeCodeHookInstaller } from "../../outbound/harnesses/claude-code/claude-code-hook-installer.js";
import { CodexHookInstaller } from "../../outbound/harnesses/codex/codex-hook-installer.js";
import { FilesystemWorkspaceProvisioner } from "../../outbound/filesystem/filesystem-workspace-provisioner.js";
import { ProcessHarnessRunner } from "../../outbound/harnesses/process-harness-runner.js";
import { BenchmarkSchema, type Benchmark } from "../../../domain/benchmark/benchmark-schema.js";
import type { HarnessCommand } from "../../../domain/harnesses/harness-profile.js";
import { runHookCapture, type HookCaptureProvider } from "./hook-capture.js";

const EX_USAGE = 1;
const EX_CONFIG = 78;

export interface CliRuntime {
  readonly stdin?: string;
  readonly stdout?: (chunk: string) => void;
  readonly stderr?: (chunk: string) => void;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

interface CliContext {
  readonly stdin: string;
  readonly stdout: (chunk: string) => void;
  readonly stderr: (chunk: string) => void;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

class CliExit extends Error {
  public constructor(
    public readonly exitCode: number,
    message: string
  ) {
    super(message);
  }
}

export async function runCli(argv = process.argv, runtime: CliRuntime = {}): Promise<number> {
  const hasInjectedRuntime =
    runtime.stdin !== undefined ||
    runtime.stdout !== undefined ||
    runtime.stderr !== undefined ||
    runtime.cwd !== undefined ||
    runtime.env !== undefined;
  const context: CliContext = {
    stdin: runtime.stdin ?? (hasInjectedRuntime || process.stdin.isTTY ? "" : await readStdin()),
    stdout: runtime.stdout ?? ((chunk) => process.stdout.write(chunk)),
    stderr: runtime.stderr ?? ((chunk) => process.stderr.write(chunk)),
    cwd: runtime.cwd ?? process.cwd(),
    env: runtime.env ?? process.env
  };
  const program = buildProgram(context);

  try {
    await program.parseAsync(argv, { from: "node" });
    return 0;
  } catch (error) {
    if (error instanceof CliExit) {
      return error.exitCode;
    }

    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    const message = error instanceof Error ? error.message : String(error);
    context.stderr(`${message}\n`);
    return EX_USAGE;
  }
}

export function buildProgram(context: CliContext): Command {
  const program = new Command();

  program
    .name("bench-my-harness")
    .description("Benchmark and observability harness for comparing agentic coding tools.")
    .exitOverride()
    .configureOutput({
      writeOut: context.stdout,
      writeErr: context.stderr
    });

  program
    .command("hook-capture")
    .description("Capture one harness hook event from stdin.")
    .requiredOption("--provider <provider>", "hook provider: codex or claude_code")
    .requiredOption("--event <event>", "provider hook event name")
    .option("--run-id <runId>", "benchmark run id")
    .option("--trial-id <trialId>", "benchmark trial id")
    .option("--event-source <source>", "hook event source", "stdin")
    .requiredOption("--spool <path>", "fallback JSONL spool path")
    .option("--ingest-url <url>", "optional local ingest endpoint")
    .option("--max-payload-bytes <bytes>", "maximum accepted stdin payload bytes", parsePositiveInt)
    .option("--strict", "fail the hook command when telemetry persistence fails", false)
    .action(async (options: HookCaptureCommandOptions) => {
      const eventSource = options.eventSource ?? "stdin";
      if (eventSource !== "stdin") {
        fail(EX_USAGE, `unsupported event source: ${eventSource}`);
      }

      const provider = parseProvider(options.provider);
      const result = await runHookCapture({
        provider,
        event: options.event,
        runId: options.runId ?? context.env.BMH_RUN_ID ?? "",
        trialId: options.trialId ?? context.env.BMH_TRIAL_ID ?? "",
        stdin: context.stdin,
        spoolPath: resolvePath(context.cwd, options.spool),
        ingestUrl: options.ingestUrl,
        maxPayloadBytes: options.maxPayloadBytes,
        strict: options.strict ?? false
      });

      if (result.stdout.length > 0) {
        context.stdout(`${result.stdout}\n`);
      }

      if (result.stderr.length > 0) {
        context.stderr(`${result.stderr}\n`);
      }

      if (result.exitCode !== 0) {
        throw new CliExit(result.exitCode, result.stderr);
      }
    });

  const validate = program.command("validate").description("Validate Bench My Harness inputs.");

  validate
    .command("benchmark")
    .description("Validate a benchmark JSON fixture.")
    .argument("<path>", "benchmark JSON file")
    .action(async (path: string) => {
      try {
        const benchmark = await readBenchmark(path, context.cwd);
        context.stdout(`benchmark valid: ${benchmark.id}@${benchmark.version}\n`);
      } catch (error) {
        context.stderr(`benchmark invalid: ${formatError(error)}\n`);
        throw new CliExit(EX_USAGE, "benchmark invalid");
      }
    });

  program
    .command("run")
    .description("Run one benchmark trial.")
    .requiredOption("--benchmark <path>", "benchmark JSON file")
    .requiredOption("--harness <harness>", "harness: codex or claude_code")
    .option("--workspace-root <path>", "root directory for trial workspace", ".bmh/workspaces")
    .option("--run-id <runId>", "run id", defaultRunId())
    .option("--trial-id <trialId>", "trial id", "trial_1")
    .option("--strict-telemetry", "fail trial on telemetry failures", false)
    .option("--dry-run", "use a fake harness runner instead of Codex or Claude Code binaries", false)
    .option("--harness-command-json <json>", "JSON command config for a fake/local harness process")
    .action(async (options: RunCommandOptions) => {
      const harness = parseProvider(options.harness);
      const benchmark = await readBenchmark(options.benchmark, context.cwd);

      const configuredCommand = options.harnessCommandJson
        ? parseHarnessCommandJson(options.harnessCommandJson)
        : undefined;

      if (!options.dryRun && !configuredCommand) {
        context.stderr(
          "process harness execution is not configured for this CLI build; rerun with --dry-run or configure a real harness runner\n"
        );
        throw new CliExit(EX_CONFIG, "process harness execution is not configured");
      }

      const runner = new BenchmarkRunner({
        hookInstaller: options.dryRun ? new DryRunHookInstaller() : hookInstallerFor(harness),
        harnessRunner: configuredCommand
          ? new ProcessHarnessRunner({
              [harness]: configuredCommand.command
            })
          : new DryRunHarnessRunner(),
        artifactCollector: new DryRunArtifactCollector(),
        workspaceProvisioner: new FilesystemWorkspaceProvisioner()
      });
      const result = await runner.runTrial({
        benchmark,
        harness,
        runId: options.runId,
        trialId: options.trialId,
        workspaceRoot: resolvePath(context.cwd, options.workspaceRoot),
        strictTelemetry: options.strictTelemetry ?? false
      });

      context.stdout(
        `${JSON.stringify({
          run_id: options.runId,
          trial_id: options.trialId,
          benchmark: `${benchmark.id}@${benchmark.version}`,
          harness,
          mode: configuredCommand ? "process" : "dry-run",
          status: result.status,
          failure_classification: result.failure_classification,
          workspace: result.workspace
        })}\n`
      );

      if (result.status !== "completed") {
        throw new CliExit(EX_USAGE, result.failure_classification ?? "benchmark failed");
      }
    });

  program
    .command("report")
    .description("Render a benchmark run report.")
    .option("--input <path>", "JSON report input")
    .option("--run-id <runId>", "run id to load from configured storage")
    .action(async (options: ReportCommandOptions) => {
      if (options.input) {
        const report = await readJsonFile(options.input, context.cwd);
        context.stdout(renderReport(report));
        return;
      }

      if (options.runId) {
        context.stderr(`run not found: ${options.runId}; report storage is not configured for this CLI build\n`);
        throw new CliExit(EX_CONFIG, `run not found: ${options.runId}`);
      }

      context.stderr("report requires --input <path> or --run-id <id>\n");
      throw new CliExit(EX_USAGE, "report requires input");
    });

  return program;
}

interface HookCaptureCommandOptions {
  readonly provider: string;
  readonly event: string;
  readonly runId?: string;
  readonly trialId?: string;
  readonly eventSource?: string;
  readonly spool: string;
  readonly ingestUrl?: string;
  readonly maxPayloadBytes?: number;
  readonly strict?: boolean;
}

interface RunCommandOptions {
  readonly benchmark: string;
  readonly harness: string;
  readonly workspaceRoot: string;
  readonly runId: string;
  readonly trialId: string;
  readonly strictTelemetry?: boolean;
  readonly dryRun?: boolean;
  readonly harnessCommandJson?: string;
}

interface ReportCommandOptions {
  readonly input?: string;
  readonly runId?: string;
}

async function readBenchmark(path: string, cwd: string): Promise<Benchmark> {
  return BenchmarkSchema.parse(await readJsonFile(path, cwd));
}

async function readJsonFile(path: string, cwd: string): Promise<unknown> {
  if (path.endsWith(".yml") || path.endsWith(".yaml")) {
    throw new Error("YAML benchmarks are not supported by this build; provide JSON");
  }

  return JSON.parse(await readFile(resolvePath(cwd, path), "utf8")) as unknown;
}

function parseProvider(provider: string): HookCaptureProvider {
  if (provider === "codex" || provider === "claude_code") {
    return provider;
  }

  fail(EX_USAGE, `unsupported provider: ${provider}`);
}

function parseHarnessCommandJson(json: string): { command: HarnessCommand; env: Record<string, string> } {
  const parsed = JSON.parse(json) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("harness command JSON must be an object");
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.executable !== "string" || record.executable.length === 0) {
    throw new Error("harness command JSON requires executable");
  }

  const args = record.args === undefined
    ? []
    : Array.isArray(record.args) && record.args.every((arg) => typeof arg === "string")
      ? record.args
      : undefined;
  if (!args) {
    throw new Error("harness command JSON args must be an array of strings");
  }

  const env = record.env === undefined ? {} : parseStringRecord(record.env, "env");

  return {
    command: {
      executable: record.executable,
      args,
      env,
      promptDelivery: "stdin"
    },
    env
  };
}

function parseStringRecord(value: unknown, label: string): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`harness command JSON ${label} must be an object`);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (typeof entry !== "string") {
        throw new Error(`harness command JSON ${label}.${key} must be a string`);
      }
      return [key, entry];
    })
  );
}

function hookInstallerFor(provider: HookCaptureProvider): InstallHarnessHooksPort {
  return provider === "codex" ? new CodexHookInstaller() : new ClaudeCodeHookInstaller();
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`expected a positive integer, got: ${value}`);
  }

  return parsed;
}

function resolvePath(cwd: string, path: string): string {
  return resolve(cwd, path);
}

function defaultRunId(): string {
  return `run_${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
}

function fail(exitCode: number, message: string): never {
  throw new CliExit(exitCode, message);
}

function formatError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function renderReport(report: unknown): string {
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("report input must be a JSON object");
  }

  const record = report as Record<string, unknown>;
  const runId = stringField(record.run_id) ?? stringField(record.runId) ?? "unknown";
  const status = stringField(record.status) ?? "unknown";
  const lines = [`Run ${runId}`, `Status: ${status}`];
  const trials = Array.isArray(record.trials) ? record.trials : [];

  for (const trial of trials) {
    if (trial === null || typeof trial !== "object" || Array.isArray(trial)) {
      continue;
    }

    const trialRecord = trial as Record<string, unknown>;
    const harness = stringField(trialRecord.harness) ?? stringField(trialRecord.provider) ?? "unknown";
    const trialStatus = stringField(trialRecord.status) ?? "unknown";
    lines.push(`${harness}: ${trialStatus}`);
  }

  return `${lines.join("\n")}\n`;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

class DryRunHookInstaller implements InstallHarnessHooksPort {
  public async install() {
    return { id: "dry-run-hooks", files: [] };
  }

  public async uninstall(): Promise<void> {}
}

class DryRunHarnessRunner implements HarnessRunnerPort {
  public async execute(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return { exitCode: 0, stdout: "dry-run", stderr: "" };
  }
}

class DryRunArtifactCollector implements ArtifactCollectorPort {
  public async collect() {
    return [];
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runCli();
  process.exitCode = exitCode;
}
