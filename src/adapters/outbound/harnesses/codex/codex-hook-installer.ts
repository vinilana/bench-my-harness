import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type {
  GeneratedHookFile,
  HookInstallation,
  InstallHarnessHooksInput,
  InstallHarnessHooksPort
} from "../../../../application/ports/install-harness-hooks-port.js";

const CODEX_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "Stop"
] as const;

type CodexEvent = (typeof CODEX_EVENTS)[number];

export class CodexHookInstaller implements InstallHarnessHooksPort {
  public async install(input: InstallHarnessHooksInput): Promise<HookInstallation> {
    const workspace = resolve(input.workspace);
    const spoolPath = resolve(input.spoolPath);
    assertInsideWorkspace(workspace, spoolPath, "spoolPath");

    const hooksPath = join(workspace, ".codex", "hooks.json");
    assertInsideWorkspace(workspace, hooksPath, "Codex hook config");
    const generatedFile = await writeGeneratedJsonFile(hooksPath, buildCodexHooks(input, spoolPath));

    return {
      id: `codex-hooks:${input.runId}:${input.trialId}`,
      provider: "codex",
      workspace,
      files: [hooksPath],
      generatedFiles: [generatedFile]
    };
  }

  public async uninstall(installation: HookInstallation): Promise<void> {
    if (!installation.workspace || !installation.generatedFiles) {
      return;
    }

    const workspace = resolve(installation.workspace);

    for (const generatedFile of installation.generatedFiles) {
      const filePath = resolve(generatedFile.path);
      assertInsideWorkspace(workspace, filePath, "generated hook file");

      if (generatedFile.previousContent === undefined) {
        await rm(filePath, { force: true });
        continue;
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, generatedFile.previousContent, "utf8");
    }
  }
}

function buildCodexHooks(input: InstallHarnessHooksInput, spoolPath: string): { hooks: Record<CodexEvent, unknown[]> } {
  const hooks = Object.fromEntries(
    CODEX_EVENTS.map((event) => [
      event,
      [
        {
          matcher: matcherFor(event),
          hooks: [{ type: "command", command: hookCommand(event, input, spoolPath), timeout: 5 }]
        }
      ]
    ])
  ) as Record<CodexEvent, unknown[]>;

  return { hooks };
}

function matcherFor(event: CodexEvent): string {
  if (event === "SessionStart") {
    return "startup|resume";
  }

  if (event === "PreToolUse" || event === "PostToolUse") {
    return ".*";
  }

  return "";
}

function hookCommand(event: string, input: InstallHarnessHooksInput, spoolPath: string): string {
  return [
    "bench-my-harness",
    "hook-capture",
    "--provider",
    "codex",
    "--event",
    shellQuote(event),
    "--run-id",
    shellQuote(input.runId),
    "--trial-id",
    shellQuote(input.trialId),
    "--event-source",
    "stdin",
    "--spool",
    shellQuote(spoolPath)
  ].join(" ");
}

async function writeGeneratedJsonFile(path: string, contents: unknown): Promise<GeneratedHookFile> {
  const previousContent = await readExistingFile(path);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(contents, null, 2)}\n`, "utf8");

  return previousContent === undefined ? { path } : { path, previousContent };
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

function assertInsideWorkspace(workspace: string, candidatePath: string, label: string): void {
  const root = resolve(workspace);
  const target = resolve(candidatePath);
  const targetRelativePath = relative(root, target);

  if (targetRelativePath === "" || targetRelativePath === ".." || targetRelativePath.startsWith(`..${sep}`)) {
    throw new Error(`${label} must be inside the trial workspace`);
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
