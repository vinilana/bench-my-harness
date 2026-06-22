import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";
import { BenchmarkCategorySchema } from "../../src/domain/benchmark/benchmark-schema.js";

describe("CLI consolidation and interactive mode", () => {
  test("no-args CLI opens the guided menu on TTY and prints help off TTY", async () => {
    const ttyOutput = createOutput();
    const nonTtyOutput = createOutput();

    const ttyExit = await runCli(["node", "bench-my-harness"], {
      stdout: ttyOutput.stdout,
      stderr: ttyOutput.stderr,
      stdin: "",
      isTty: true
    });
    const nonTtyExit = await runCli(["node", "bench-my-harness"], {
      stdout: nonTtyOutput.stdout,
      stderr: nonTtyOutput.stderr,
      isTty: false
    });

    expect(ttyExit).toBe(0);
    expect(ttyOutput.stdout()).toContain("Set up a catalog");
    expect(ttyOutput.stdout()).toContain("Add a spec");
    expect(ttyOutput.stdout()).toContain("View report");
    expect(ttyOutput.stdout()).toContain("Quit");
    expect(nonTtyExit).not.toBe(0);
    expect(nonTtyOutput.stdout()).toContain("Usage: bmh");
  });

  test("no-args menu loops until quit and re-displays after each action", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-menu-loop-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: interactiveAnswers(["init", "check", "quit"]),
      isTty: true
    });

    const stdout = output.stdout() ?? "";
    expect(exitCode).toBe(0);
    expect(stdout).toContain("spec catalog initialized");
    expect(stdout).toContain("spec catalog: valid");
    // The menu header is re-printed before each of the three prompts.
    expect(stdout.split("Set up a catalog").length - 1).toBeGreaterThanOrEqual(3);
  });

  test("no-args menu can dispatch a dry-run", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-menu-run-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: interactiveAnswers(["init", "run", "dry-run", "quit"]),
      isTty: true
    });

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("spec suite dry-run complete");
  });

  test("no-args menu can render a report for a prior run", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-menu-report-"));
    const output = createOutput();

    await runCli(["node", "bench-my-harness", "init"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr
    });
    await runCli(["node", "bench-my-harness", "run", "--dry-run", "--run-id", "menu-report-run"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr
    });

    const menuOutput = createOutput();
    const exitCode = await runCli(["node", "bench-my-harness"], {
      cwd,
      stdout: menuOutput.stdout,
      stderr: menuOutput.stderr,
      stdin: interactiveAnswers(["report", "menu-report-run", "html", "quit"]),
      isTty: true
    });

    expect(exitCode).toBe(0);
    expect(menuOutput.stdout()).toContain("HTML report written");
    expect(menuOutput.stdout()).toContain("menu-report-run");
  });

  test("no-args menu can dispatch to catalog initialization", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-menu-init-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: "init\n",
      isTty: true
    });

    const suite = JSON.parse(await readFile(join(cwd, ".bmh", "specs", "suite.json"), "utf8")) as {
      id: string;
    };

    expect(exitCode).toBe(0);
    expect(suite.id).toBe("local-specs");
    expect(output.stdout()).toContain("spec catalog initialized");
  });

  test("no-args menu can dispatch to add spec prompts", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-menu-add-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: interactiveAnswers([
        "add",
        "feature",
        "repo",
        ".",
        "",
        "n",
        "",
        "npm test",
        "text",
        "Implement the menu-added spec.",
        "",
        "",
        "",
        "",
        "",
        ""
      ]),
      isTty: true
    });

    const benchmark = JSON.parse(
      await readFile(join(cwd, ".bmh", "specs", "cases", "ada-lovelace-case", "benchmark.json"), "utf8")
    ) as { prompt: { file: string } };

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("spec created:");
    expect(benchmark.prompt.file).toBe("spec.md");
  });

  test("non-TTY run --benchmark fails fast when a required harness is omitted", async () => {
    const output = createOutput();

    const exitCode = await runCli(
      ["node", "bench-my-harness", "run", "--benchmark", "tests/fixtures/benchmarks/login-validation.benchmark.json", "--dry-run"],
      { stdout: output.stdout, stderr: output.stderr, isTty: false }
    );

    expect(exitCode).not.toBe(0);
    expect(output.stderr()).toContain("run --benchmark requires --harness");
  });

  test("non-TTY bare add fails fast instead of consuming interactive input", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-non-tty-add-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "add"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: interactiveAnswers(["feature", "repo", "."]),
      isTty: false
    });

    expect(exitCode).not.toBe(0);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("add requires a prompt file, --from-git, or an interactive TTY");
  });

  test("interactive add accepts catalog defaults with Enter", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-defaults-"));
    const output = createOutput();
    await mkdir(join(cwd, ".bmh", "specs"), { recursive: true });

    await expect(
      runCli(
        [
          "node",
          "bench-my-harness",
          "init",
          "--repo-path",
          ".",
          "--category",
          "bugfix",
          "--setup-command",
          "npm install",
          "--test-command",
          "npm test",
          "--include-in-suite"
        ],
        { cwd, stdout: output.stdout, stderr: output.stderr }
      )
    ).resolves.toBe(0);

    const exitCode = await runCli(["node", "bench-my-harness", "add"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: interactiveAnswers([
        "",
        "",
        "",
        "",
        "n",
        "",
        "",
        "",
        "Implement the default-backed spec.",
        "",
        "",
        "",
        "",
        "",
        ""
      ]),
      isTty: true
    });

    const benchmark = JSON.parse(
      await readFile(join(cwd, ".bmh", "specs", "cases", "ada-lovelace-case", "benchmark.json"), "utf8")
    ) as {
      category: string;
      repo: { url: string; setup_commands: string[]; test_commands: string[] };
    };

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("Category");
    expect(output.stdout()).toContain("[bugfix]");
    expect(output.stdout()).toContain("Repo URL or path [.]");
    expect(benchmark.category).toBe("bugfix");
    expect(benchmark.repo.url).toBe(pathToFileURL(resolve(cwd)).href);
    expect(benchmark.repo.setup_commands).toEqual(["npm install"]);
    expect(benchmark.repo.test_commands).toEqual(["npm test"]);
  });

  test("interactive category choices come from the schema and invalid values re-prompt", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-cli-category-"));
    const output = createOutput();
    const exitCode = await runCli(["node", "bench-my-harness", "add"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: interactiveAnswers([
        "not-a-category",
        "security",
        "repo",
        ".",
        "",
        "n",
        "",
        "npm test",
        "text",
        "Implement the security spec.",
        "",
        "",
        "",
        "",
        "",
        ""
      ]),
      isTty: true
    });

    const stdout = output.stdout();
    const benchmark = JSON.parse(
      await readFile(join(cwd, ".bmh", "specs", "cases", "ada-lovelace-case", "benchmark.json"), "utf8")
    ) as { category: string };

    expect(exitCode).toBe(0);
    for (const category of BenchmarkCategorySchema.options) {
      expect(stdout).toContain(category);
    }
    expect(stdout).toContain("Category must be one of");
    expect(benchmark.category).toBe("security");
  });
});

function interactiveAnswers(answers: string[]): string {
  return `${answers.join("\n")}\n`;
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
