import { describe, expect, test } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectTrialArtifacts } from "../../src/application/use-cases/collect-trial-artifacts.js";

describe("artifact collection", () => {
  test("collects transcript, diff, and test output artifacts with hashes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-artifacts-"));
    const transcript = join(workspace, "transcript.jsonl");
    const diff = join(workspace, "git-diff.patch");
    const testOutput = join(workspace, "test-output.txt");
    await writeFile(transcript, "{\"type\":\"assistant\",\"text\":\"done\"}\n");
    await writeFile(diff, "diff --git a/a b/a\n");
    await writeFile(testOutput, "PASS\n");

    const artifacts = await collectTrialArtifacts({
      runId: "run_1",
      trialId: "trial_1",
      workspace,
      transcriptPath: transcript,
      diffPath: diff,
      testOutputPath: testOutput
    });

    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "transcript", content_hash: expect.stringMatching(/^sha256:/) }),
        expect.objectContaining({ kind: "diff", content_hash: expect.stringMatching(/^sha256:/) }),
        expect.objectContaining({ kind: "test_output", content_hash: expect.stringMatching(/^sha256:/) })
      ])
    );
  });

  test("rejects transcript paths outside the trial workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "bmh-artifacts-"));

    await expect(
      collectTrialArtifacts({
        runId: "run_1",
        trialId: "trial_1",
        workspace,
        transcriptPath: "/etc/passwd"
      })
    ).rejects.toThrow(/outside workspace|path traversal/i);
  });
});
