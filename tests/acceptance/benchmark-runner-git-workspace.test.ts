import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

import { FilesystemWorkspaceProvisioner } from "../../src/adapters/outbound/filesystem/filesystem-workspace-provisioner.js";
import { FilesystemGitDiffGenerator } from "../../src/adapters/outbound/filesystem/filesystem-git-diff-generator.js";
import { ProcessValidationRunner } from "../../src/adapters/outbound/harnesses/process-validation-runner.js";
import type { ArtifactCollectorInput, ArtifactCollectorPort } from "../../src/application/ports/artifact-collector-port.js";
import type {
  HarnessRunnerInput,
  HarnessRunnerPort,
  HarnessRunnerResult
} from "../../src/application/ports/harness-runner-port.js";
import type {
  HookInstallation,
  InstallHarnessHooksInput,
  InstallHarnessHooksPort
} from "../../src/application/ports/install-harness-hooks-port.js";
import { BenchmarkRunner } from "../../src/application/use-cases/run-benchmark.js";

describe("benchmark runner git workspace", () => {
  test("runs hooks, harness, validation, and generated diff collection inside the checkout", async () => {
    const fixture = await createGitFixture();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "bmh-runner-git-workspaces-"));
    const hookInstaller = new WritingHookInstaller();
    const harnessRunner = new EditingHarnessRunner();
    const artifactCollector = new RecordingArtifactCollector();
    const runner = new BenchmarkRunner({
      hookInstaller,
      harnessRunner,
      validationRunner: new ProcessValidationRunner(),
      diffGenerator: new FilesystemGitDiffGenerator(),
      artifactCollector,
      workspaceProvisioner: new FilesystemWorkspaceProvisioner()
    });

    const result = await runner.runTrial({
      benchmark: {
        id: "git-workspace",
        version: "1.0.0",
        repo: {
          url: pathToFileURL(fixture.repoPath).href,
          base_ref: fixture.baseSha,
          golden_ref: fixture.goldenSha,
          test_commands: [validationCommand()]
        },
        prompt: {
          text: "modify app.txt"
        },
        limits: {
          timeout_seconds: 10
        }
      },
      harness: "codex",
      runId: "run_git_workspace",
      trialId: "trial_git_workspace",
      workspaceRoot
    });

    expect(result.status).toBe("completed");
    expect(result.workspace).toBe(join(workspaceRoot, "trial_git_workspace"));
    expect(result.workspace_source).toMatchObject({
      type: "git",
      repo_url: pathToFileURL(fixture.repoPath).href,
      base_ref: fixture.baseSha,
      resolved_base_sha: fixture.baseSha,
      golden_ref: fixture.goldenSha,
      resolved_golden_sha: fixture.goldenSha
    });
    expect(hookInstaller.installCalls[0].workspace).toBe(result.workspace);
    await expect(readFile(join(result.workspace, ".codex", "hooks.json"), "utf8")).resolves.toContain("hook");
    expect(harnessRunner.calls[0].workspace).toBe(result.workspace);
    expect(artifactCollector.calls[0].workspace).toBe(result.workspace);
    expect(artifactCollector.calls[0].diffPath).toBe(".bmh/generated.diff.patch");

    const validationOutput = await readFile(join(result.workspace, ".bmh", "validation-output.txt"), "utf8");
    expect(validationOutput).toContain(result.workspace);

    const generatedDiff = await readFile(join(result.workspace, ".bmh", "generated.diff.patch"), "utf8");
    expect(generatedDiff).toContain("diff --git a/app.txt b/app.txt");
    expect(generatedDiff).toContain("+agent edit");

    await expect(readFile(join(fixture.repoPath, "app.txt"), "utf8")).resolves.toBe("golden\n");
    await expect(git(fixture.repoPath, ["status", "--short"])).resolves.toBe("");
  });
});

class EditingHarnessRunner implements HarnessRunnerPort {
  public readonly calls: HarnessRunnerInput[] = [];

  public async execute(input: HarnessRunnerInput): Promise<HarnessRunnerResult> {
    this.calls.push(input);
    await writeFile(join(input.workspace, "app.txt"), "agent edit\n", "utf8");
    return { exitCode: 0 };
  }
}

class WritingHookInstaller implements InstallHarnessHooksPort {
  public readonly installCalls: InstallHarnessHooksInput[] = [];

  public async install(input: InstallHarnessHooksInput): Promise<HookInstallation> {
    this.installCalls.push(input);
    const hookPath = join(input.workspace, ".codex", "hooks.json");
    await mkdir(join(input.workspace, ".codex"), { recursive: true });
    await writeFile(hookPath, "{\"hook\":true}\n", "utf8");
    return { id: input.trialId, provider: input.harness, workspace: input.workspace, files: [hookPath] };
  }

  public async uninstall(): Promise<void> {}
}

class RecordingArtifactCollector implements ArtifactCollectorPort {
  public readonly calls: ArtifactCollectorInput[] = [];

  public async collect(input: ArtifactCollectorInput): Promise<[]> {
    this.calls.push(input);
    return [];
  }
}

async function createGitFixture(): Promise<{ repoPath: string; baseSha: string; goldenSha: string }> {
  const repoPath = await mkdtemp(join(tmpdir(), "bmh-runner-source-repo-"));
  await git(repoPath, ["init", "--initial-branch=main"]);
  await writeFile(join(repoPath, "app.txt"), "base\n", "utf8");
  await git(repoPath, ["add", "app.txt"]);
  await git(repoPath, ["-c", "user.name=BMH Test", "-c", "user.email=bmh@example.test", "commit", "-m", "base"]);
  const baseSha = (await git(repoPath, ["rev-parse", "HEAD"])).trim();

  await writeFile(join(repoPath, "app.txt"), "golden\n", "utf8");
  await git(repoPath, ["add", "app.txt"]);
  await git(repoPath, ["-c", "user.name=BMH Test", "-c", "user.email=bmh@example.test", "commit", "-m", "golden"]);
  const goldenSha = (await git(repoPath, ["rev-parse", "HEAD"])).trim();

  return { repoPath, baseSha, goldenSha };
}

function validationCommand(): string {
  const script = [
    "const fs = require('node:fs');",
    "if (!fs.existsSync('app.txt')) process.exit(2);",
    "if (fs.existsSync('golden-only.txt')) process.exit(3);",
    "console.log(process.cwd());"
  ].join("");

  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function git(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}
