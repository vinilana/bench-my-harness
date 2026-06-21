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
  test("specs init creates an editable local suite catalog", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-init-"));
    const output = createOutput();

    const exitCode = await runCli(["node", "bench-my-harness", "specs", "init"], {
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

  test("specs create writes a feature benchmark, prompt, and suite reference from flags", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-create-"));
    const catalogRoot = join(dir, ".bmh/specs");
    const repo = await createFeatureRepo(dir);
    const promptFile = join(dir, "login-validation.md");
    await writeFile(promptFile, "# Login validation\n\nReject invalid email addresses.\n", "utf8");
    const output = createOutput();
    await runCli(["node", "bench-my-harness", "specs", "init", "--catalog-root", catalogRoot], createRuntime(output));

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "specs",
        "create",
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

    const specPath = join(catalogRoot, "features/login-validation/spec.md");
    const benchmarkPath = join(catalogRoot, "features/login-validation/benchmark.json");
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
        path: "features/login-validation/benchmark.json",
        tags: ["auth"]
      }
    ]);
    expect(output.stdout()).toMatch(/spec (created|written): .*login-validation|spec written: login-validation/s);
  });

  test("specs create --from-git writes deterministic backward draft evidence", async () => {
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
        "specs",
        "create",
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

    const spec = await readFile(join(catalogRoot, "features/login-validation/spec.md"), "utf8");
    const benchmark = BenchmarkSchema.parse(
      JSON.parse(await readFile(join(catalogRoot, "features/login-validation/benchmark.json"), "utf8"))
    );

    expect(spec).toContain("Re-implement the behavior introduced between");
    expect(spec).toContain("TODO: Review");
    expect(spec).toContain("src/auth/validation.ts");
    expect(spec).toContain("tests/auth/validation.test.ts");
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
        source: "backward_git_draft",
        review_status: "needs_human_review"
      }
    });
    expect(output.stdout()).toMatch(/backward .*draft .*login-validation|backward .*draft .*benchmark\.json/s);
  });

  test("specs backfill defaults to 25 drafts when no limit is provided", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-backfill-"));
    const catalogRoot = join(dir, ".bmh/specs");
    const repo = await createBackfillRepo(dir, 27);
    const output = createOutput();
    await runCli(["node", "bench-my-harness", "specs", "init", "--catalog-root", catalogRoot], createRuntime(output));

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "specs",
        "backfill",
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

    const drafts = await readdir(join(catalogRoot, "backfill"));
    const suite = SpecCatalogSchema.parse(JSON.parse(await readFile(join(catalogRoot, "suite.json"), "utf8")));

    expect(drafts).toHaveLength(25);
    expect(suite.specs).toEqual([]);
    expect(output.stdout()).toMatch(/backfill|backward spec drafts/s);
    expect(output.stdout()).toContain("25");
  });

  test("specs backfill rejects non-positive limits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-specs-backfill-limit-"));
    const repo = await createBackfillRepo(dir, 1);
    const output = createOutput();

    const exitCode = await runCli(
      [
        "node",
        "bench-my-harness",
        "specs",
        "backfill",
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

async function createBackfillRepo(parent: string, featureCount: number): Promise<{
  path: string;
  baseRef: string;
  headRef: string;
}> {
  const repo = join(parent, "backfill-repo");
  await mkdir(repo, { recursive: true });
  await git(repo, ["init"]);
  await git(repo, ["config", "user.email", "bench@example.com"]);
  await git(repo, ["config", "user.name", "Bench Test"]);
  await writeFile(join(repo, "README.md"), "# Backfill fixture\n", "utf8");
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
