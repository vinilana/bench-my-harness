import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FilesystemPromptFileReader } from "../../src/adapters/outbound/filesystem/filesystem-prompt-file-reader.js";

describe("filesystem prompt file reader", () => {
  test("reads markdown prompt files by relative path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-prompt-file-"));
    await writeFile(join(dir, "task.md"), "# Task\n\nImplement the feature.\n", "utf8");

    const result = await new FilesystemPromptFileReader().read({
      root: dir,
      path: "task.md"
    });

    expect(result).toMatchObject({
      path: "task.md",
      content: "# Task\n\nImplement the feature.\n"
    });
    expect(result.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("rejects absolute paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-prompt-file-"));

    await expect(
      new FilesystemPromptFileReader().read({
        root: dir,
        path: join(dir, "task.md")
      })
    ).rejects.toThrow(/relative/i);
  });

  test("rejects path traversal", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-prompt-file-"));

    await expect(
      new FilesystemPromptFileReader().read({
        root: dir,
        path: "../outside.md"
      })
    ).rejects.toThrow(/traversal|outside/i);
  });

  test("rejects empty markdown prompt files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-prompt-file-"));
    await writeFile(join(dir, "empty.md"), "  \n\t", "utf8");

    await expect(
      new FilesystemPromptFileReader().read({
        root: dir,
        path: "empty.md"
      })
    ).rejects.toThrow(/empty/i);
  });

  test("rejects non-markdown prompt files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-prompt-file-"));
    await writeFile(join(dir, "task.txt"), "Do the work.", "utf8");

    await expect(
      new FilesystemPromptFileReader().read({
        root: dir,
        path: "task.txt"
      })
    ).rejects.toThrow(/\.md/i);
  });
});
