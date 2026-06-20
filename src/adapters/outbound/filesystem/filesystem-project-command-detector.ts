import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  DetectProjectCommandsInput,
  NodePackageManager,
  ProjectCommandDetection,
  ProjectCommandDetectorPort
} from "../../../application/ports/project-command-detector-port.js";

const LOCKFILES: readonly { readonly file: string; readonly packageManager: NodePackageManager }[] = [
  { file: "pnpm-lock.yaml", packageManager: "pnpm" },
  { file: "yarn.lock", packageManager: "yarn" },
  { file: "bun.lock", packageManager: "bun" },
  { file: "bun.lockb", packageManager: "bun" },
  { file: "package-lock.json", packageManager: "npm" }
];

export class FilesystemProjectCommandDetector implements ProjectCommandDetectorPort {
  public async detect(input: DetectProjectCommandsInput): Promise<ProjectCommandDetection> {
    const packageJson = await readPackageJson(input.root);

    if (!packageJson.found) {
      return {
        supported: false,
        reason: "package.json not found"
      };
    }

    if (!packageJson.valid) {
      return {
        supported: false,
        reason: "package.json is invalid",
        evidence: ["package.json"]
      };
    }

    const lockfile = await detectLockfile(input.root);
    const scripts = scriptNames(packageJson.value);

    return {
      supported: true,
      ecosystem: "node",
      packageManager: lockfile?.packageManager ?? "npm",
      scripts,
      evidence: [
        "package.json",
        ...(lockfile ? [lockfile.file] : []),
        ...scripts.map((script) => `scripts.${script}`)
      ]
    };
  }
}

type PackageJsonReadResult =
  | { readonly found: true; readonly valid: true; readonly value: unknown }
  | { readonly found: true; readonly valid: false }
  | { readonly found: false };

async function readPackageJson(root: string): Promise<PackageJsonReadResult> {
  try {
    const content = await readFile(join(root, "package.json"), "utf8");
    return {
      found: true,
      valid: true,
      value: JSON.parse(content)
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { found: false };
    }

    if (error instanceof SyntaxError) {
      return { found: true, valid: false };
    }

    throw error;
  }
}

async function detectLockfile(
  root: string
): Promise<{ readonly file: string; readonly packageManager: NodePackageManager } | undefined> {
  for (const lockfile of LOCKFILES) {
    if (await fileExists(join(root, lockfile.file))) {
      return lockfile;
    }
  }

  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

function scriptNames(packageJson: unknown): string[] {
  if (!isRecord(packageJson) || !isRecord(packageJson.scripts)) {
    return [];
  }

  return Object.entries(packageJson.scripts)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([script]) => script);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
