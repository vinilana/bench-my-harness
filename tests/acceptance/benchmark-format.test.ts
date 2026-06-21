import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("benchmark format", () => {
  test("CLI accepts JSON benchmark fixtures for v1", async () => {
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "check", "tests/fixtures/benchmarks/login-validation.benchmark.json"],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("benchmark valid: login-validation-001@1.0.0");
    expect(output.stderr()).toBe("");
  });

  test("CLI explicitly rejects YAML benchmark fixtures as outside JSON-only v1", async () => {
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "check", "tests/fixtures/benchmarks/login-validation.benchmark.yml"],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("check invalid: YAML benchmarks are not supported by this build; provide JSON");
  });

  test("run rejects YAML benchmark fixtures before harness execution", async () => {
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness", "run", "--benchmark",
        "tests/fixtures/benchmarks/login-validation.benchmark.yml",
        "--harness",
        "codex",
        "--dry-run"
      ],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("YAML benchmarks are not supported by this build; provide JSON");
  });

  test("README and coverage matrix document JSON-only v1 benchmark behavior", async () => {
    const readme = await readFile("README.md", "utf8");
    const coverage = await readFile("docs/specs/12-implementation-coverage.md", "utf8");

    expect(readme).toContain("JSON-only v1");
    expect(readme).toContain("YAML benchmark files are rejected");
    expect(coverage).toContain("JSON-only v1");
    expect(coverage).toContain("rejects `.yml` and `.yaml` benchmark files");
  });

  test("real Codex and Claude smoke tests are documented as opt-in and excluded from npm test", async () => {
    const readme = await readFile("README.md", "utf8");
    const coverage = await readFile("docs/specs/12-implementation-coverage.md", "utf8");
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };

    expect(readme).toContain("Real Harness Smoke Tests");
    expect(readme).toContain("local-only");
    expect(readme).toContain("must not run as part of `npm test`");
    expect(coverage).toContain("opt-in local-only smoke tests");
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts.test).not.toContain("codex");
    expect(pkg.scripts.test).not.toContain("claude");
    expect(pkg.scripts.test).not.toContain("smoke");
  });
});

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
