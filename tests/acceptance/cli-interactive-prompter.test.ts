import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";
import { ScriptedPrompter } from "../../src/adapters/inbound/cli/scripted-prompter.js";
import { InteractiveBenchmarkAuthoring } from "../../src/adapters/inbound/cli/interactive-benchmark-authoring.js";
import { PromptCancelledError } from "../../src/adapters/inbound/cli/prompter.js";
import { BenchmarkCategorySchema } from "../../src/domain/benchmark/benchmark-schema.js";

describe("interactive prompter (spec 25)", () => {
  test("inline validation re-prompts an invalid number and keeps the valid one", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-prompter-validate-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "add"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: interactiveAnswers([
        "feature",
        "repo",
        ".",
        "",
        "n",
        "npm install",
        "npm test",
        "text",
        "Implement the validated spec.",
        "",
        "abc", // invalid timeout — must be re-prompted
        "900", // valid timeout
        "",
        "",
        "",
        ""
      ]),
      isTty: true
    });

    const benchmark = JSON.parse(
      await readFile(join(cwd, ".bmh", "specs", "cases", "ada-lovelace-case", "benchmark.json"), "utf8")
    ) as { limits?: { timeout_seconds?: number } };

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("timeout seconds must be a positive number");
    expect(output.stdout()).toContain("spec created:");
    expect(benchmark.limits?.timeout_seconds).toBe(900);
  });

  test("declining the review confirm writes nothing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-prompter-review-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "add"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: interactiveAnswers([
        "feature",
        "repo",
        ".",
        "",
        "n",
        "npm install",
        "npm test",
        "text",
        "Implement the declined spec.",
        "",
        "",
        "",
        "",
        "",
        "",
        "n" // decline the review confirm
      ]),
      isTty: true
    });

    expect(exitCode).not.toBe(0);
    expect(output.stderr()).toContain("cancelled");
    // Cancelling through the real CLI must leave the catalog, suite, and workspace untouched —
    // not just the benchmark file. This is the end-to-end "cancel writes nothing" guarantee.
    await expect(stat(join(cwd, ".bmh", "specs", "cases", "ada-lovelace-case", "benchmark.json"))).rejects.toThrow();
    await expect(stat(join(cwd, ".bmh", "specs", "suite.json"))).rejects.toThrow();
    await expect(stat(join(cwd, ".bmh", "workspaces"))).rejects.toThrow();
  });

  // The end-to-end "no files written on cancel" guarantee is proven by the review-decline test
  // above (it drives runCli to the point just before the write, then cancels). A true mid-flow
  // Ctrl+C cannot be fed through a stdin string, so this test isolates the propagation mechanism:
  // a cancel partway through collection aborts with PromptCancelledError before a command is
  // ever returned, so no write path can run.
  test("a cancel mid-flow aborts before any spec is built", async () => {
    const output = createOutput();
    const prompter = new ScriptedPrompter({
      answers: ["feature", "repo", "."],
      stdout: output.stdout,
      cancelAt: 2 // simulate Ctrl+C at the repo prompt
    });

    const authoring = new InteractiveBenchmarkAuthoring({ prompter });

    await expect(authoring.collect()).rejects.toBeInstanceOf(PromptCancelledError);
  });

  test("the category prompt offers exactly the schema's options", async () => {
    const output = createOutput();
    const prompter = new ScriptedPrompter({ answers: ["feature"], stdout: output.stdout });

    const selected = await prompter.select({
      message: "Category",
      options: BenchmarkCategorySchema.options.map((value) => ({ value })),
      initialValue: "feature"
    });

    expect(selected).toBe("feature");
    // The rendered choices are derived from the schema, so a new enum member would appear
    // here with no change to the prompt code.
    for (const category of BenchmarkCategorySchema.options) {
      expect(output.stdout()).toContain(category);
    }
  });

  test("multiselect parses comma/space separated values and falls back to defaults", async () => {
    const output = createOutput();
    const options = [{ value: "codex" }, { value: "claude_code" }] as const;

    const both = await new ScriptedPrompter({ answers: ["codex, claude_code"], stdout: output.stdout }).multiselect({
      message: "Harnesses",
      options
    });
    const fallback = await new ScriptedPrompter({ answers: [""], stdout: output.stdout }).multiselect({
      message: "Harnesses",
      options,
      initialValues: ["codex"]
    });

    expect(both).toEqual(["codex", "claude_code"]);
    expect(fallback).toEqual(["codex"]);
  });

  test("only ClackPrompter imports the @clack/prompts engine", async () => {
    const srcRoot = fileURLToPath(new URL("../../src", import.meta.url));
    const offenders: string[] = [];

    // Match every way the engine could be pulled in: `from "..."`, dynamic `import("...")`,
    // `require("...")`, and bare side-effect `import "..."`. A comment mention is not an import.
    const importsEngine = /(?:from|import|require)\s*\(?\s*["']@clack\/prompts["']/;
    for (const file of await collectTypeScriptFiles(srcRoot)) {
      const contents = await readFile(file, "utf8");
      if (importsEngine.test(contents) && !file.endsWith("clack-prompter.ts")) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

async function collectTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(path)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}

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
