import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("CLI spec configure", () => {
  test("writes authoring defaults into .bmh/specs/suite.json", async () => {
    const cwd = await prepareTempWorkspace("writes-defaults");
    const output = createOutput();
    await initCatalog(cwd, output);

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "--repo-path",
        ".",
        "--category",
        "feature",
        "--setup-command",
        "npm install",
        "--test-command",
        "npm test",
        "--test-command",
        "npm run typecheck",
        "--test-command",
        "npm run build",
        "--harness",
        "codex",
        "--harness",
        "claude_code",
        "--trials",
        "3",
        "--include-in-suite"
      ],
      runtime(cwd, output)
    );

    const suite = await readSuite(cwd);
    expect(exitCode).toBe(0);
    expect(suite.defaults).toMatchObject({
      repo_path: ".",
      category: "feature",
      trials: 3,
      harnesses: ["codex", "claude_code"],
      setup_commands: ["npm install"],
      test_commands: ["npm test", "npm run typecheck", "npm run build"],
      include_in_suite: true
    });
    expect(output.stderr()).toBe("");
  });

  test("repeated setup and test command flags preserve order", async () => {
    const cwd = await prepareTempWorkspace("command-order");
    const output = createOutput();
    await initCatalog(cwd, output);

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "--setup-command",
        "corepack enable",
        "--setup-command",
        "pnpm install --frozen-lockfile",
        "--test-command",
        "pnpm test",
        "--test-command",
        "pnpm typecheck",
        "--test-command",
        "pnpm build"
      ],
      runtime(cwd, output)
    );

    const suite = await readSuite(cwd);
    expect(exitCode).toBe(0);
    expect(suite.defaults?.setup_commands).toEqual(["corepack enable", "pnpm install --frozen-lockfile"]);
    expect(suite.defaults?.test_commands).toEqual(["pnpm test", "pnpm typecheck", "pnpm build"]);
  });

  test("explicit command flags replace existing command defaults", async () => {
    const cwd = await prepareTempWorkspace("command-overrides");
    const output = createOutput();
    await initCatalog(cwd, output);
    await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "--setup-command",
        "npm install",
        "--test-command",
        "npm test"
      ],
      runtime(cwd, output)
    );

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "init",
        "--setup-command",
        "pnpm install --frozen-lockfile",
        "--test-command",
        "pnpm test:unit"
      ],
      runtime(cwd, output)
    );

    const suite = await readSuite(cwd);
    expect(exitCode).toBe(0);
    expect(suite.defaults?.setup_commands).toEqual(["pnpm install --frozen-lockfile"]);
    expect(suite.defaults?.test_commands).toEqual(["pnpm test:unit"]);
  });

  test("rejects invalid harness defaults", async () => {
    const cwd = await prepareTempWorkspace("invalid-harness");
    const output = createOutput();
    await initCatalog(cwd, output);

    const exitCode = await runCli(
      ["node", "bench-my-harness", "init", "--harness", "cursor"],
      runtime(cwd, output)
    );

    expect(exitCode).toBe(1);
    expect((await readSuite(cwd)).defaults?.harnesses).not.toContain("cursor");
  });
});

async function initCatalog(cwd: string, output: ReturnType<typeof createOutput>): Promise<void> {
  const exitCode = await runCli(["node", "bench-my-harness", "init"], runtime(cwd, output));
  expect(exitCode).toBe(0);
}

async function readSuite(cwd: string): Promise<{ defaults?: Record<string, unknown> }> {
  return JSON.parse(await readFile(join(cwd, ".bmh", "specs", "suite.json"), "utf8")) as {
    defaults?: Record<string, unknown>;
  };
}

async function prepareTempWorkspace(slug: string): Promise<string> {
  const dir = join(tmpdir(), "bench-my-harness-acceptance-17-configure", slug);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

function runtime(cwd: string, output: ReturnType<typeof createOutput>): {
  cwd: string;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
} {
  return { cwd, stdout: output.stdout, stderr: output.stderr };
}

function createOutput(): {
  stdout: (chunk?: string) => string | undefined;
  stderr: (chunk?: string) => string | undefined;
} {
  let stdout = "";
  let stderr = "";

  return {
    stdout: (chunk?: string) => {
      if (chunk === undefined) {
        return stdout;
      }

      stdout += chunk;
      return undefined;
    },
    stderr: (chunk?: string) => {
      if (chunk === undefined) {
        return stderr;
      }

      stderr += chunk;
      return undefined;
    }
  };
}
