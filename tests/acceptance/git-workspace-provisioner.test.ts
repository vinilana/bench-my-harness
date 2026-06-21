import { access, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { FilesystemWorkspaceProvisioner } from "../../src/adapters/outbound/filesystem/filesystem-workspace-provisioner.js";
import { createLocalGitFixture, git } from "../support/git-fixture.js";

describe("git workspace provisioner", () => {
  test("provisions a local git checkout at base_ref without mutating the source repository", async () => {
    const fixture = await createLocalGitFixture();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "bmh-git-workspaces-"));
    const provisioner = new FilesystemWorkspaceProvisioner();

    const result = await provisioner.provision({
      workspaceRoot,
      trialId: "trial_base_checkout",
      source: {
        type: "git",
        repoUrl: fixture.repoUrl,
        baseRef: fixture.baseSha,
        goldenRef: fixture.goldenSha
      }
    });

    expect(result.workspace).toBe(join(workspaceRoot, "trial_base_checkout"));
    expect(result.spoolPath).toBe(join(result.workspace, ".bmh", "hooks.jsonl"));
    expect(await git(["rev-parse", "HEAD"], result.workspace)).toBe(fixture.baseSha);
    await expect(readFile(join(result.workspace, fixture.baseFile), "utf8")).resolves.toContain("\"base\"");
    await expect(access(join(result.workspace, fixture.goldenOnlyFile))).rejects.toThrow();
    expect(result.workspaceSource).toEqual({
      type: "git",
      repo_url: fixture.repoUrl,
      base_ref: fixture.baseSha,
      resolved_base_sha: fixture.baseSha,
      golden_ref: fixture.goldenSha,
      resolved_golden_sha: fixture.goldenSha
    });
    expect(await git(["rev-parse", "HEAD"], fixture.repoPath)).toBe(fixture.goldenSha);
    expect(await git(["status", "--porcelain"], fixture.repoPath)).toBe("");
  });

  test("rejects trial destinations that escape workspace_root", async () => {
    const fixture = await createLocalGitFixture();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "bmh-git-workspaces-"));
    const provisioner = new FilesystemWorkspaceProvisioner();

    await expect(provisioner.provision({
      workspaceRoot,
      trialId: "../outside-workspace",
      source: {
        type: "git",
        repoUrl: fixture.repoUrl,
        baseRef: fixture.baseSha
      }
    })).rejects.toThrow(/inside workspace root/i);
  });

  test("rejects existing trial workspaces instead of reusing them", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "bmh-git-workspaces-"));
    const provisioner = new FilesystemWorkspaceProvisioner();
    await mkdir(join(workspaceRoot, "trial_already_exists"), { recursive: true });

    await expect(provisioner.provision({
      workspaceRoot,
      trialId: "trial_already_exists"
    })).rejects.toThrow(/already exists/i);
  });

  test("rejects unsupported non-local repository URLs without leaking credentials", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "bmh-git-workspaces-"));
    const provisioner = new FilesystemWorkspaceProvisioner();

    await expect(provisioner.provision({
      workspaceRoot,
      trialId: "remote_repo",
      source: {
        type: "git",
        repoUrl: "https://user:secret@example.com/org/repo.git",
        baseRef: "main"
      }
    })).rejects.toThrow(/unsupported git repository URL for local provisioning/i);

    await provisioner.provision({
      workspaceRoot,
      trialId: "remote_repo_again",
      source: {
        type: "git",
        repoUrl: "https://user:secret@example.com/org/repo.git",
        baseRef: "main"
      }
    }).catch((error: unknown) => {
      expect(String(error)).not.toContain("secret");
    });
  });
});
