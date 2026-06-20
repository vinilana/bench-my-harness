import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  PromptFileReaderPort,
  ReadPromptFileInput,
  ReadPromptFileResult
} from "../../../application/ports/prompt-file-reader-port.js";

export class FilesystemPromptFileReader implements PromptFileReaderPort {
  public async read(input: ReadPromptFileInput): Promise<ReadPromptFileResult> {
    const promptPath = assertValidPromptPath(input.root, input.path);
    const content = await readPromptFile(promptPath, input.path);

    if (content.trim().length === 0) {
      throw new Error(`Prompt file is empty: ${input.path}`);
    }

    return {
      path: input.path,
      content,
      contentHash: `sha256:${createHash("sha256").update(content).digest("hex")}`
    };
  }
}

function assertValidPromptPath(root: string, candidatePath: string): string {
  if (isAbsolute(candidatePath)) {
    throw new Error(`Prompt file path must be relative: ${candidatePath}`);
  }

  if (!candidatePath.endsWith(".md")) {
    throw new Error(`Prompt file must end with .md: ${candidatePath}`);
  }

  if (candidatePath.split(/[\\/]/).includes("..")) {
    throw new Error(`Prompt file path traversal is not allowed: ${candidatePath}`);
  }

  const rootPath = resolve(root);
  const promptPath = resolve(rootPath, candidatePath);
  const relativePath = relative(rootPath, promptPath);

  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Prompt file path is outside root: ${candidatePath}`);
  }

  return promptPath;
}

async function readPromptFile(promptPath: string, originalPath: string): Promise<string> {
  try {
    return await readFile(promptPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new Error(`Prompt file not found: ${originalPath}`);
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
