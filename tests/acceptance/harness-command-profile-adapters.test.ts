import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  checkHarnessCommandAvailability,
  getBuiltInHarnessCommandProfile
} from "../../src/adapters/outbound/harnesses/harness-command-profiles.js";

describe("harness command profile adapters", () => {
  test("Codex profile uses codex exec with stdin and no unsupported approval flag", () => {
    const profile = getBuiltInHarnessCommandProfile("codex");

    expect(profile.capabilityStatus).toBe("supported");
    expect(profile.command).toMatchObject({
      executable: "codex",
      promptDelivery: "stdin"
    });
    expect(profile.command?.args).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--dangerously-bypass-hook-trust",
      "-"
    ]);
    expect(profile.command?.args).not.toContain("--ask-for-approval");
  });

  test("Claude Code profile reports unsupported until its real command contract is implemented", () => {
    const profile = getBuiltInHarnessCommandProfile("claude_code");

    expect(profile.capabilityStatus).toBe("unsupported");
    expect(profile.command).toBeUndefined();
    expect(profile.reason).toContain("Claude Code real process command profile is not implemented");
  });

  test("availability check resolves PATH entries and reports missing executables clearly", async () => {
    const binDir = await mkdtemp(join(tmpdir(), "bmh-command-profile-bin-"));
    const executable = join(binDir, "fake-codex");
    await writeFile(executable, "#!/bin/sh\nexit 0\n", { encoding: "utf8", mode: 0o755 });

    await expect(
      checkHarnessCommandAvailability({ executable: "fake-codex" }, { PATH: binDir })
    ).resolves.toMatchObject({
      available: true,
      executable: "fake-codex",
      resolvedPath: executable
    });

    await expect(
      checkHarnessCommandAvailability({ executable: "missing-codex" }, { PATH: `${binDir}${delimiter}${binDir}` })
    ).resolves.toMatchObject({
      available: false,
      executable: "missing-codex",
      reason: "not_found",
      message: "harness executable not found on PATH: missing-codex"
    });
  });
});
