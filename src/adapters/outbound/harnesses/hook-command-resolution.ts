import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeneratedHookFile } from "../../../application/ports/install-harness-hooks-port.js";

export type HookCommandStrategy = "workspace_shim";

export interface HookCommandResolutionInput {
  readonly workspace: string;
  readonly cliEntrypoint?: string;
  readonly nodeExecutable?: string;
}

export interface HookCommandResolution {
  readonly strategy: HookCommandStrategy;
  readonly command: string;
  readonly shimPath: string;
  readonly generatedFiles: readonly GeneratedHookFile[];
}

export type HookCommandResolver = (input: HookCommandResolutionInput) => Promise<HookCommandResolution>;

export async function createRunLocalHookCommandShim(
  input: HookCommandResolutionInput
): Promise<HookCommandResolution> {
  const workspace = resolve(input.workspace);
  const shimPath = join(workspace, ".bmh", "bin", "bmh");
  const cliEntrypoint = resolve(input.cliEntrypoint ?? defaultCliEntrypoint());
  const nodeExecutable = input.nodeExecutable ?? process.execPath;
  const previousContent = await readExistingFile(shimPath);
  const script = [
    "#!/bin/sh",
    "if [ \"${1:-}\" = \"hook-capture\" ]; then",
    `  exec ${shellQuote(nodeExecutable)} -e ${shellQuote(hookCaptureShimJavaScript())} "$@"`,
    "fi",
    `exec ${shellQuote(nodeExecutable)} ${shellQuote(cliEntrypoint)} "$@"`,
    ""
  ].join("\n");

  await mkdir(dirname(shimPath), { recursive: true });
  await writeFile(shimPath, script, "utf8");
  await chmod(shimPath, 0o755);

  return {
    strategy: "workspace_shim",
    command: shimPath,
    shimPath,
    generatedFiles: previousContent === undefined ? [{ path: shimPath }] : [{ path: shimPath, previousContent }]
  };
}

function defaultCliEntrypoint(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../inbound/cli/main.js");
}

async function readExistingFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function hookCaptureShimJavaScript(): string {
  return `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(1);
const opt = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const spool = opt("--spool");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  if (!spool) {
    process.exitCode = 64;
    return;
  }
  let payload;
  try {
    payload = input.trim().length === 0 ? {} : JSON.parse(input);
  } catch {
    payload = { raw: input };
  }
  fs.mkdirSync(path.dirname(spool), { recursive: true });
  fs.appendFileSync(spool, JSON.stringify({
    schema_version: "bmh.hook_capture.v1",
    provider: opt("--provider"),
    event: opt("--event"),
    run_id: opt("--run-id"),
    trial_id: opt("--trial-id"),
    captured_at: new Date().toISOString(),
    payload
  }) + "\\n");
});
`;
}
