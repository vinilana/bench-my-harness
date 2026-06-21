import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/adapters/inbound/cli/main.js";
import { BenchmarkSchema, SpecCatalogSchema } from "../../src/domain/benchmark/benchmark-schema.js";

const execFileAsync = promisify(execFile);

describe("CLI spec authoring", () => {
  test("init creates an editable local suite catalog", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-init-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "init"], {
      ...createRuntime(output),
      cwd: dir
    });

    const suitePath = join(dir, ".bmh/specs/suite.json");
    expect(cliResult(exitCode, output)).toMatchObject({ exitCode: 0, stderr: "" });

    const suite = SpecCatalogSchema.parse(JSON.parse(await readFile(suitePath, "utf8")));

    expect(suite.id).toMatch(/^local-spec/);
    expect(suite.name).toMatch(/^Local spec/);
    expect(suite.version).toBe("1.0.0");
    expect(suite.specs).toEqual([]);
    expect(output.stdout()).toContain("spec catalog");
  });

  test("add writes a feature benchmark, prompt, and suite reference from flags", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-create-"));
    const catalogRoot = join(dir, ".bmh/specs");
    const repo = await createFeatureRepo(dir);
    const promptFile = join(dir, "login-validation.md");
    await writeFile(promptFile, "# Login validation\n\nReject invalid email addresses.\n", "utf8");
    const output = createOutput();
    await runCli(["node", "bench-my-harness", "init", "--catalog-root", catalogRoot], createRuntime(output));

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "add",
        "--catalog-root",
        catalogRoot,
        "--id",
        "login-validation",
        "--name",
        "Login validation",
        "--category",
        "bugfix",
        "--tag",
        "auth",
        "--repo-path",
        repo.path,
        "--base-ref",
        "base-login",
        "--golden-ref",
        "golden-login",
        "--prompt-file",
        promptFile,
        "--test-command",
        "npm test",
        "--include-in-suite"
      ],
      createRuntime(output)
    );

    expect(cliResult(exitCode, output)).toMatchObject({ exitCode: 0, stderr: "" });

    const specPath = join(catalogRoot, "cases/login-validation/spec.md");
    const benchmarkPath = join(catalogRoot, "cases/login-validation/benchmark.json");
    const suitePath = join(catalogRoot, "suite.json");
    const benchmark = BenchmarkSchema.parse(JSON.parse(await readFile(benchmarkPath, "utf8")));
    const suite = SpecCatalogSchema.parse(JSON.parse(await readFile(suitePath, "utf8")));

    expect(await readFile(specPath, "utf8")).toBe("# Login validation\n\nReject invalid email addresses.\n");
    expect(benchmark).toMatchObject({
      id: "login-validation",
      name: "Login validation",
      category: "bugfix",
      tags: ["auth"],
      repo: {
        url: pathToFileURL(resolve(repo.path)).href,
        base_ref: "base-login",
        golden_ref: "golden-login",
        test_commands: ["npm test"]
      },
      prompt: {
        file: "spec.md"
      }
    });
    expect(suite.specs).toEqual([
      {
        id: "login-validation",
        path: "cases/login-validation/benchmark.json",
        tags: ["auth"]
      }
    ]);
    expect(output.stdout()).toMatch(/spec (created|written): .*login-validation|spec written: login-validation/s);
  });

  test("add with no arguments collects interactive answers and writes a generated id and default name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-add-interactive-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "add"], {
      ...createRuntime(output),
      cwd: dir,
      isTty: true,
      stdin: interactiveAnswers([
        "feature",
        "repo",
        ".",
        "",
        "n",
        "npm install",
        "npm test",
        "text",
        "Implement the interactive spec.",
        "Keep the public API stable",
        "900",
        "",
        "src/login.ts",
        "",
        "Unit tests must pass"
      ])
    });

    expect(cliResult(exitCode, output)).toMatchObject({ exitCode: 0, stderr: "" });

    const specPath = join(dir, ".bmh/specs/cases/ada-lovelace-case/spec.md");
    const benchmarkPath = join(dir, ".bmh/specs/cases/ada-lovelace-case/benchmark.json");
    const suitePath = join(dir, ".bmh/specs/suite.json");
    const benchmark = BenchmarkSchema.parse(JSON.parse(await readFile(benchmarkPath, "utf8")));
    const suite = SpecCatalogSchema.parse(JSON.parse(await readFile(suitePath, "utf8")));

    expect(await readFile(specPath, "utf8")).toBe("# Ada Lovelace Case\n\nImplement the interactive spec.\n");
    expect(benchmark).toMatchObject({
      id: "ada-lovelace-case",
      name: "Ada Lovelace Case",
      category: "feature",
      repo: {
        url: pathToFileURL(resolve(dir, ".")).href,
        setup_commands: ["npm install"],
        test_commands: ["npm test"]
      },
      prompt: {
        file: "spec.md",
        constraints: ["Keep the public API stable"]
      },
      expected_output: {
        required_files_changed: ["src/login.ts"],
        semantic_requirements: ["Unit tests must pass"]
      }
    });
    expect(suite.specs).toContainEqual({
      id: "ada-lovelace-case",
      path: "cases/ada-lovelace-case/benchmark.json"
    });
    expect(output.stdout()).not.toContain("Benchmark id");
    expect(output.stdout()).not.toContain("Name:");
    expect(output.stdout()).toContain("spec created:");
  });

  test("add --from-git writes a generated Git case without leaking commit refs into the prompt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-from-git-"));
    const catalogRoot = join(dir, ".bmh/specs");
    const repo = await createFeatureRepo(dir);
    const baseRef = await git(repo.path, ["rev-parse", "HEAD~1"]);
    const goldenRef = await git(repo.path, ["rev-parse", "HEAD"]);
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "add",
        "--from-git",
        "--catalog-root",
        catalogRoot,
        "--repo-path",
        repo.path,
        "--base-ref",
        baseRef,
        "--golden-ref",
        goldenRef,
        "--id",
        "login-validation",
        "--name",
        "Login validation",
        "--category",
        "bugfix",
        "--test-command",
        "npm test"
      ],
      createRuntime(output)
    );

    expect(cliResult(exitCode, output)).toMatchObject({ exitCode: 0, stderr: "" });

    const spec = await readFile(join(catalogRoot, "generated/git/login-validation/spec.md"), "utf8");
    const benchmark = BenchmarkSchema.parse(
      JSON.parse(await readFile(join(catalogRoot, "generated/git/login-validation/benchmark.json"), "utf8"))
    );

    expect(spec).not.toContain(baseRef);
    expect(spec).not.toContain(goldenRef);
    expect(spec).not.toContain("Re-implement the behavior introduced between");
    expect(spec).not.toContain("src/auth/validation.ts");
    expect(spec).not.toContain("tests/auth/validation.test.ts");
    expect(spec).toContain("## Expected Behavior");
    expect(benchmark).toMatchObject({
      id: "login-validation",
      repo: {
        url: pathToFileURL(resolve(repo.path)).href,
        base_ref: baseRef,
        golden_ref: goldenRef,
        test_commands: ["npm test"]
      },
      expected_output: {
        required_files_changed: ["src/auth/validation.ts", "tests/auth/validation.test.ts"]
      },
      metadata: {
        source: "generated_git",
        generation_mode: "git_evidence",
        prompt_mode: "behavior_summary",
        bias_profile: "generated_from_history"
      }
    });
    expect(output.stdout()).toMatch(/generated git case .*login-validation|generated git case .*benchmark\.json/s);
  });

  test("add --from-git does not include generated cases in the suite from defaults", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-generated-suite-default-"));
    const catalogRoot = join(dir, ".bmh/specs");
    const repo = await createFeatureRepo(dir);
    const baseRef = await git(repo.path, ["rev-parse", "HEAD~1"]);
    const goldenRef = await git(repo.path, ["rev-parse", "HEAD"]);
    const output = createOutput();
    await runCli(["node", "bench-my-harness", "init", "--catalog-root", catalogRoot, "--include-in-suite"], createRuntime(output));

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "add",
        "--from-git",
        "--catalog-root",
        catalogRoot,
        "--repo-path",
        repo.path,
        "--base-ref",
        baseRef,
        "--golden-ref",
        goldenRef,
        "--category",
        "bugfix"
      ],
      createRuntime(output)
    );

    const suite = SpecCatalogSchema.parse(JSON.parse(await readFile(join(catalogRoot, "suite.json"), "utf8")));

    expect(cliResult(exitCode, output)).toMatchObject({ exitCode: 0, stderr: "" });
    expect(suite.specs).toEqual([]);
  });

  test("add --from-git --range defaults to 25 generated Git cases when no limit is provided", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-generated-"));
    const catalogRoot = join(dir, ".bmh/specs");
    const repo = await createGeneratedGitRepo(dir, 27);
    const output = createOutput();
    await runCli(["node", "bench-my-harness", "init", "--catalog-root", catalogRoot], createRuntime(output));

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "add", "--from-git",
        "--catalog-root",
        catalogRoot,
        "--repo-path",
        repo.path,
        "--range",
        `${repo.baseRef}..${repo.headRef}`
      ],
      createRuntime(output)
    );

    expect(cliResult(exitCode, output)).toMatchObject({ exitCode: 0, stderr: "" });

    const generated = await readdir(join(catalogRoot, "generated/git"));
    const suite = SpecCatalogSchema.parse(JSON.parse(await readFile(join(catalogRoot, "suite.json"), "utf8")));

    expect(generated).toHaveLength(25);
    expect(suite.specs).toEqual([]);
    expect(output.stdout()).toMatch(/generated git cases/s);
    expect(output.stdout()).toContain("25");
  });

  test("add --from-git --range rejects non-positive limits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-generated-limit-"));
    const repo = await createGeneratedGitRepo(dir, 1);
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "add", "--from-git",
        "--repo-path",
        repo.path,
        "--range",
        `${repo.baseRef}..${repo.headRef}`,
        "--limit",
        "0"
      ],
      createRuntime(output)
    );

    expect(exitCode).toBe(1);
    expect(output.stderr()).toMatch(/limit|positive integer/i);
  });
});

async function createFeatureRepo(parent: string): Promise<{ path: string }> {
  const repo = join(parent, "feature-repo");
  const fixture = resolve("tests/fixtures/git-history/login-validation");
  await mkdir(repo, { recursive: true });
  await cp(join(fixture, "base"), repo, { recursive: true, force: true });
  await git(repo, ["init"]);
  await git(repo, ["config", "user.email", "bench@example.com"]);
  await git(repo, ["config", "user.name", "Bench Test"]);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Base login validation"]);
  await cp(join(fixture, "golden"), repo, { recursive: true, force: true });
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Require email domains"]);

  return { path: repo };
}

async function createGeneratedGitRepo(parent: string, featureCount: number): Promise<{
  path: string;
  baseRef: string;
  headRef: string;
}> {
  const repo = join(parent, "generated-git-repo");
  await mkdir(repo, { recursive: true });
  await git(repo, ["init"]);
  await git(repo, ["config", "user.email", "bench@example.com"]);
  await git(repo, ["config", "user.name", "Bench Test"]);
  await writeFile(join(repo, "README.md"), "# Generated Git fixture\n", "utf8");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Initial fixture"]);
  const baseRef = await git(repo, ["rev-parse", "HEAD"]);

  for (let index = 1; index <= featureCount; index += 1) {
    const padded = String(index).padStart(2, "0");
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(join(repo, "src", `feature-${padded}.ts`), `export const feature${padded} = true;\n`, "utf8");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", `Add feature ${padded}`]);
  }

  const headRef = await git(repo, ["rev-parse", "HEAD"]);
  return { path: repo, baseRef, headRef };
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2024-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2024-01-01T00:00:00Z"
    }
  });

  return stdout.trim();
}

function createRuntime(output: ReturnType<typeof createOutput>): {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
} {
  return { stdout: output.stdout, stderr: output.stderr };
}

function interactiveAnswers(answers: string[]): string {
  return `${answers.join("\n")}\n`;
}

function cliResult(exitCode: number, output: ReturnType<typeof createOutput>): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  return {
    exitCode,
    stdout: output.stdout() ?? "",
    stderr: output.stderr() ?? ""
  };
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
