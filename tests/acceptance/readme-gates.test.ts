import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

describe("README gates", () => {
  test("documents v1 scope as Codex and Claude Code only", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("Codex");
    expect(readme).toContain("Claude Code");
    expect(readme).toContain("Getting Started");
    expect(readme).toContain("Run Codex");
    expect(readme).toContain("--harness codex");
    expect(readme).toContain("Run Claude Code");
    expect(readme).toContain("--harness claude_code");
    expect(readme).toContain("Roadmap Scope");
    expect(readme).toContain("Implemented in v1");
    expect(readme).toContain("Future phases");
    expect(readme).toContain("Cursor, OpenCode, and Pi adapters");
  });

  test("documents best-effort versus strict telemetry", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("best-effort");
    expect(readme).toContain("strict mode");
    expect(readme).toContain("partial observability");
  });

  test("package scripts expose documented quality commands", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.lint).toBeDefined();
  });
});
