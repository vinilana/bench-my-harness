import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";
import { FilesystemReportStore } from "../../src/adapters/outbound/storage/filesystem-report-store.js";
import type { ReportState } from "../../src/application/ports/report-store.js";

describe("CLI report filesystem store", () => {
  test("report --run-id renders a stored report from --store-root", async () => {
    const storeRoot = await tempStoreRoot("bmh-cli-report-store-");
    const output = createOutput();
    const store = new FilesystemReportStore({ root: storeRoot });

    await store.save(reportState({
      run_id: "run_123",
      provider: "codex",
      score: 92
    }));

    const exitCode = await runCli(
      ["node", "bench-my-harness", "report", "--run-id", "run_123", "--store-root", storeRoot],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("Run run_123");
    expect(output.stdout()).toContain("Provider: codex");
    expect(output.stdout()).toContain("Benchmark: login-validation@1.0.0");
    expect(output.stdout()).toContain("Score: 92");
    expect(output.stderr()).toBe("");
  });

  test("report --run-id returns EX_CONFIG for a missing stored run without echoing store secrets", async () => {
    const dir = await tempStoreRoot("bmh-cli-report-missing-");
    const storeRoot = join(dir, "store-sk-test-1234567890");
    const output = createOutput();
    await mkdir(storeRoot);

    const exitCode = await runCli(
      ["node", "bench-my-harness", "report", "--run-id", "run_missing", "--store-root", storeRoot],
      { stdout: output.stdout, stderr: output.stderr }
    );

    expect(exitCode).toBe(78);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("run not found: run_missing");
    expect(output.stderr()).not.toContain("sk-test-1234567890");
    expect(output.stderr()).not.toContain(storeRoot);
  });

  test("filesystem report store redacts secrets and omits raw payloads by default", async () => {
    const storeRoot = await tempStoreRoot("bmh-report-redacted-");
    const store = new FilesystemReportStore({ root: storeRoot });

    await store.save({
      ...reportState({
        run_id: "run_redacted",
        provider: "claude_code",
        score: 75
      }),
      notes: ["OPENAI_API_KEY=sk-test-1234567890"],
      raw_payloads: [{ authorization: "Bearer secret-token" }]
    } as unknown as ReportState);

    const storedJson = await readFile(join(storeRoot, "run_redacted", "report.json"), "utf8");
    const found = await store.findByRunId("run_redacted");

    expect(storedJson).not.toContain("\"raw_payloads\":");
    expect(storedJson).not.toContain("sk-test-1234567890");
    expect(storedJson).not.toContain("secret-token");
    expect(found?.notes).toEqual(["OPENAI_API_KEY=[REDACTED]"]);
    expect(JSON.stringify(found)).not.toContain("\"raw_payloads\":");
  });
});

async function tempStoreRoot(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(dir, { recursive: true });
  return dir;
}

function reportState(input: {
  run_id: string;
  provider: "codex" | "claude_code";
  score: number;
}): ReportState {
  return {
    run_id: input.run_id,
    benchmark: { id: "login-validation", version: "1.0.0" },
    provider: input.provider,
    generated_at: "2026-06-20T12:00:00.000Z",
    evaluation: {
      score_total: input.score,
      statistics: {
        trials: 1,
        inconclusive_trials: 0,
        mean: input.score,
        median: input.score,
        min: input.score,
        max: input.score,
        stddev: 0
      }
    },
    comparability: { status: "comparable", reasons: [] },
    effective_observability: {
      tool_calls: "partial",
      token_usage: "unavailable_from_hooks"
    },
    adapter_capabilities: [`${input.provider}_hooks`],
    security: {
      redaction: {
        status: "applied",
        raw_payloads_included: false
      }
    }
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
