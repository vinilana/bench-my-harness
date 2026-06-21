import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface LocalGitFixture {
  readonly root: string;
  readonly repoPath: string;
  readonly repoUrl: string;
  readonly baseSha: string;
  readonly baseRef: string;
  readonly goldenSha: string;
  readonly goldenRef: string;
  readonly baseFile: string;
  readonly goldenOnlyFile: string;
}

export async function createLocalGitFixture(prefix = "bmh-git-fixture-"): Promise<LocalGitFixture> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const repoPath = join(root, "repo");
  const baseFile = "src/auth/validation.ts";
  const goldenOnlyFile = "tests/auth/validation.test.ts";

  await mkdir(join(repoPath, "src", "auth"), { recursive: true });
  await git(["init"], repoPath);
  await git(["config", "user.email", "bench-my-harness@example.test"], repoPath);
  await git(["config", "user.name", "Bench My Harness Test"], repoPath);

  await writeFile(join(repoPath, "README.md"), "# Fixture app\n", "utf8");
  await writeFile(join(repoPath, baseFile), "export const validationMode = \"base\";\n", "utf8");
  await git(["add", "."], repoPath);
  await git(["commit", "-m", "base fixture"], repoPath);
  const baseSha = await git(["rev-parse", "HEAD"], repoPath);

  await mkdir(join(repoPath, "tests", "auth"), { recursive: true });
  await writeFile(join(repoPath, baseFile), "export const validationMode = \"golden\";\n", "utf8");
  await writeFile(join(repoPath, goldenOnlyFile), "expect(validationMode).toBe(\"golden\");\n", "utf8");
  await git(["add", "."], repoPath);
  await git(["commit", "-m", "golden fixture"], repoPath);
  const goldenSha = await git(["rev-parse", "HEAD"], repoPath);

  return {
    root,
    repoPath,
    repoUrl: pathToFileURL(repoPath).href,
    baseSha,
    baseRef: baseSha,
    goldenSha,
    goldenRef: goldenSha,
    baseFile,
    goldenOnlyFile
  };
}

export async function createGitFixture(prefix = "bmh-git-fixture-"): Promise<LocalGitFixture> {
  return createLocalGitFixture(prefix);
}

export async function git(args: readonly string[], cwd: string): Promise<string>;
export async function git(cwd: string, args: readonly string[]): Promise<string>;
export async function git(first: readonly string[] | string, second: readonly string[] | string): Promise<string> {
  const args = Array.isArray(first) ? first : second;
  const cwd = Array.isArray(first) ? second : first;

  const { stdout } = await execFileAsync("git", [...args], {
    cwd: String(cwd),
    encoding: "utf8"
  });

  return stdout.trim();
}
