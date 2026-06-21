import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("CLI spec catalog and suite execution", () => {
  test("init, add, doctor, and dry-run suite execution use local catalog files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-spec-suite-"));
    const output = createOutput();
    await mkdir(join(cwd, "docs"), { recursive: true });
    await writeFile(join(cwd, "docs", "login-validation.md"), "# Login validation\n\nImplement validation.\n", "utf8");

    await expect(
      runCli(["node", "bench-my-harness", "init"], {
        cwd,
        stdout: output.stdout,
        stderr: output.stderr
      })
    ).resolves.toBe(0);

    await expect(
      runCli(
        [
          "node",
          "bench-my-harness",
          "add",
          "--id",
          "login-validation",
          "--name",
          "Login validation",
          "--category",
          "bugfix",
          "--repo-path",
          ".",
          "--base-ref",
          "base123",
          "--golden-ref",
          "golden456",
          "--prompt-file",
          "./docs/login-validation.md",
          "--test-command",
          "npm test",
          "--include-in-suite"
        ],
        { cwd, stdout: output.stdout, stderr: output.stderr }
      )
    ).resolves.toBe(0);

    await expect(
      runCli(["node", "bench-my-harness", "doctor"], {
        cwd,
        stdout: output.stdout,
        stderr: output.stderr
      })
    ).resolves.toBe(0);

    await expect(
      runCli(
        [
          "node",
          "bench-my-harness",
          "run",
          "--dry-run",
          "--run-id",
          "run_suite_cli",
          "--harness",
          "codex",
          "--harness",
          "claude_code",
          "--trials",
          "2"
        ],
        { cwd, stdout: output.stdout, stderr: output.stderr }
      )
    ).resolves.toBe(0);

    const suite = JSON.parse(await readFile(join(cwd, ".bmh", "specs", "suite.json"), "utf8")) as {
      specs: Array<{ id: string; path: string }>;
    };
    const benchmark = JSON.parse(
      await readFile(join(cwd, ".bmh", "specs", "features", "login-validation", "benchmark.json"), "utf8")
    ) as {
      repo: { base_ref: string; golden_ref: string };
      prompt: { file: string };
      metadata: Record<string, unknown>;
    };
    const results = JSON.parse(await readFile(join(cwd, ".bmh", "runs", "run_suite_cli", "results.json"), "utf8")) as {
      run_id: string;
      trials: Array<{ spec_id: string; harness: string; status: string }>;
    };

    expect(suite.specs).toEqual([
      {
        id: "login-validation",
        path: "features/login-validation/benchmark.json"
      }
    ]);
    expect(benchmark.repo).toMatchObject({ base_ref: "base123", golden_ref: "golden456" });
    expect(benchmark.prompt.file).toBe("spec.md");
    expect(benchmark.metadata.source).toBe("manual_cli");
    expect(results.run_id).toBe("run_suite_cli");
    expect(results.trials).toHaveLength(4);
    expect(results.trials.map((trial) => `${trial.spec_id}:${trial.harness}:${trial.status}`)).toEqual([
      "login-validation:codex:completed",
      "login-validation:codex:completed",
      "login-validation:claude_code:completed",
      "login-validation:claude_code:completed"
    ]);
    expect(output.stderr()).toBe("");
    await expect(stat(join(
      cwd,
      ".bmh",
      "runs",
      "run_suite_cli",
      "specs",
      "login-validation",
      "codex",
      "login-validation_codex_trial_1",
      "result.json"
    ))).resolves.toBeDefined();
  });

  test("add --from-git creates a review-needed backward draft from local git evidence", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-spec-git-"));
    const output = createOutput();

    await git(cwd, "init");
    await git(cwd, "config", "user.email", "test@example.com");
    await git(cwd, "config", "user.name", "BMH Test");
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "src", "feature.ts"), "export const value = 1;\n", "utf8");
    await git(cwd, "add", ".");
    await git(cwd, "commit", "-m", "base");
    const baseRef = await git(cwd, "rev-parse", "HEAD");
    await writeFile(join(cwd, "src", "feature.ts"), "export const value = 2;\n", "utf8");
    await writeFile(join(cwd, "src", "feature.test.ts"), "expect(2).toBe(2);\n", "utf8");
    await git(cwd, "add", ".");
    await git(cwd, "commit", "-m", "add feature validation");
    const goldenRef = await git(cwd, "rev-parse", "HEAD");

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "add",
        "--from-git",
        "--id",
        "feature-validation",
        "--name",
        "Feature validation",
        "--category",
        "feature",
        "--repo-path",
        ".",
        "--base-ref",
        baseRef.trim(),
        "--golden-ref",
        goldenRef.trim(),
        "--include-in-suite"
      ],
      { cwd, stdout: output.stdout, stderr: output.stderr }
    );

    const spec = await readFile(join(cwd, ".bmh", "specs", "features", "feature-validation", "spec.md"), "utf8");
    const benchmark = JSON.parse(
      await readFile(join(cwd, ".bmh", "specs", "features", "feature-validation", "benchmark.json"), "utf8")
    ) as {
      expected_output: { required_files_changed: string[] };
      metadata: Record<string, unknown>;
      tags: string[];
    };

    expect(exitCode).toBe(0);
    expect(spec).toContain("TODO: Review and replace this section");
    expect(spec).toContain("src/feature.ts");
    expect(spec).toContain("src/feature.test.ts");
    expect(benchmark.expected_output.required_files_changed).toEqual(["src/feature.test.ts", "src/feature.ts"]);
    expect(benchmark.metadata.source).toBe("backward_git_draft");
    expect(benchmark.metadata.review_status).toBe("needs_human_review");
    expect(output.stderr()).toBe("");
  });

  test("add --from-git --range rejects non-positive limits without writing drafts", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-spec-backfill-"));
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "add", "--from-git", "--repo-path", ".", "--range", "HEAD~1..HEAD", "--limit", "0"],
      { cwd, stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("expected a positive integer");
  });
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { execFile } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve(stdout);
    });
  });
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
