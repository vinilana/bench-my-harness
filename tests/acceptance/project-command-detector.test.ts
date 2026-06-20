import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FilesystemProjectCommandDetector } from "../../src/adapters/outbound/filesystem/filesystem-project-command-detector.js";

describe("filesystem project command detector", () => {
  test("detects npm from package-lock.json", async () => {
    const root = await createNodeProject({ lockfile: "package-lock.json", scripts: { test: "vitest run" } });

    await expect(new FilesystemProjectCommandDetector().detect({ root })).resolves.toMatchObject({
      supported: true,
      ecosystem: "node",
      packageManager: "npm",
      scripts: ["test"],
      evidence: expect.arrayContaining(["package.json", "package-lock.json", "scripts.test"])
    });
  });

  test("detects pnpm from pnpm-lock.yaml", async () => {
    const root = await createNodeProject({ lockfile: "pnpm-lock.yaml", scripts: { test: "vitest run" } });

    await expect(new FilesystemProjectCommandDetector().detect({ root })).resolves.toMatchObject({
      supported: true,
      packageManager: "pnpm"
    });
  });

  test("defaults Node package manager to npm when no lockfile exists", async () => {
    const root = await createNodeProject({ scripts: { test: "vitest run" } });

    await expect(new FilesystemProjectCommandDetector().detect({ root })).resolves.toMatchObject({
      supported: true,
      packageManager: "npm",
      evidence: expect.arrayContaining(["package.json"])
    });
  });

  test("returns supported scripts from package.json", async () => {
    const root = await createNodeProject({
      scripts: {
        test: "vitest run",
        typecheck: "tsc --noEmit",
        lint: "eslint .",
        build: "tsc"
      }
    });

    await expect(new FilesystemProjectCommandDetector().detect({ root })).resolves.toMatchObject({
      scripts: ["test", "typecheck", "lint", "build"]
    });
  });

  test("returns unsupported when package.json is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-project-detector-"));

    await expect(new FilesystemProjectCommandDetector().detect({ root })).resolves.toMatchObject({
      supported: false,
      reason: "package.json not found"
    });
  });
});

async function createNodeProject(input: {
  readonly lockfile?: string;
  readonly scripts: Record<string, string>;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bmh-project-detector-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: input.scripts }, null, 2), "utf8");

  if (input.lockfile) {
    await writeFile(join(root, input.lockfile), "", "utf8");
  }

  return root;
}
