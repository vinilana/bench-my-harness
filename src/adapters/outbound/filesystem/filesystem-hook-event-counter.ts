import { readFile } from "node:fs/promises";

import type { HookEventCounterPort } from "../../../application/ports/hook-event-counter-port.js";

export class FilesystemHookEventCounter implements HookEventCounterPort {
  public async count(input: { readonly spoolPath: string }): Promise<number> {
    try {
      const contents = await readFile(input.spoolPath, "utf8");
      return contents.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    } catch (error) {
      if (isNotFoundError(error)) {
        return 0;
      }

      throw error;
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
