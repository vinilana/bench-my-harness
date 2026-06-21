import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../../src/adapters/inbound/cli/main.js";

describe("spec suite HTML report", () => {
  test("report --format html renders a redacted static suite report with filters and unavailable metrics", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bmh-suite-html-report-"));
    const runDir = join(cwd, ".bmh", "runs", "run_html");
    const output = createOutput();

    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, "results.json"),
      JSON.stringify(
        {
          run_id: "run_html",
          suite: { id: "core-regression-suite", version: "1.0.0", name: "Core regression suite" },
          generated_at: "2026-06-20T12:00:00.000Z",
          selected_harnesses: ["codex", "claude_code"],
          specs: [
            { id: "login-validation", version: "1.0.0", tags: ["auth"] },
            { id: "pricing-rounding", version: "1.0.0", tags: ["billing"] }
          ],
          trials: [
            {
              spec_id: "login-validation",
              spec_version: "1.0.0",
              harness: "codex",
              trial_id: "trial_1",
              status: "completed",
              score: 1,
              duration_ms: 25,
              metrics: {
                tokens: { status: "unavailable", measurement_source: "none", capture_source: "dry_run", confidence: "unavailable" },
                cost: { status: "unavailable", measurement_source: "none", capture_source: "dry_run", confidence: "unavailable" },
                context: { status: "unavailable", measurement_source: "none", capture_source: "dry_run", confidence: "unavailable" }
              },
              artifacts: ["specs/login-validation/codex/trial_1/result.json"],
              comparability: { status: "limited", reasons: ["dry-run fake harness"] },
              notes: ["OPENAI_API_KEY=sk-test-1234567890"]
            },
            {
              spec_id: "pricing-rounding",
              spec_version: "1.0.0",
              harness: "claude_code",
              trial_id: "trial_1",
              status: "failed",
              failure_classification: "agent_failed",
              score: 0,
              duration_ms: 40,
              metrics: {
                tokens: { status: "unavailable", measurement_source: "none", capture_source: "dry_run", confidence: "unavailable" },
                cost: { status: "unavailable", measurement_source: "none", capture_source: "dry_run", confidence: "unavailable" },
                context: { status: "unavailable", measurement_source: "none", capture_source: "dry_run", confidence: "unavailable" }
              },
              artifacts: ["specs/pricing-rounding/claude_code/trial_1/result.json"],
              comparability: { status: "limited", reasons: ["dry-run fake harness"] },
              notes: []
            }
          ],
          observability: {
            token_usage: "unavailable",
            cost: "unavailable",
            context: "unavailable"
          },
          comparability: { status: "limited", reasons: ["dry-run fake harness"] },
          security: { redaction: { status: "applied", raw_payloads_included: false } },
          raw_payloads: [{ authorization: "Bearer secret-token" }]
        },
        null,
        2
      ),
      "utf8"
    );

    const exitCode = await runCli(["node", "bench-my-harness", "report", "--run-id", "run_html", "--format", "html"], {
      cwd,
      stdout: output.stdout,
      stderr: output.stderr
    });

    const html = await readFile(join(runDir, "report.html"), "utf8");

    expect(exitCode).toBe(0);
    expect(output.stdout()).toContain("HTML report written:");
    expect(output.stderr()).toBe("");
    expect(html).toContain("Core regression suite");
    expect(html).toContain("run_html");
    expect(html).toContain("filter-harness");
    expect(html).toContain("filter-spec");
    expect(html).toContain("filter-tag");
    expect(html).toContain("filter-status");
    expect(html).toContain("filter-comparability");
    expect(html).toContain("Global Benchmark Summary");
    expect(html).toContain("Pass rate by harness");
    expect(html).toContain("unavailable");
    expect(html).toContain("dry-run fake harness");
    expect(html).toContain("specs/login-validation/codex/trial_1/result.json");
    expect(html).toContain("Redaction: applied");
    expect(html).not.toContain("sk-test-1234567890");
    expect(html).not.toContain("secret-token");
    expect(html).not.toContain("raw_payloads");
  });
});

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
