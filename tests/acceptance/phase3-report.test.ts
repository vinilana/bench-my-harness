import { describe, expect, test } from "vitest";
import { BenchmarkReportRenderer } from "../../src/adapters/outbound/reports/benchmark-report-renderer.js";
import { ExportReportUseCase, type ExportReportInput } from "../../src/application/use-cases/export-report.js";

describe("phase 3 reports", () => {
  test("exports comparability-aware JSON with capabilities and redaction status", () => {
    const report = exportReport({
      format: "json",
      report: reportInput()
    });
    const parsed = JSON.parse(report);

    expect(parsed.comparability).toEqual({
      status: "limited",
      reasons: ["metric_source_limited:input_tokens"]
    });
    expect(parsed.effective_observability).toEqual({
      tool_calls: "partial",
      tool_results: "partial",
      assistant_output: "derived",
      token_usage: "unavailable_from_hooks",
      context_usage: "unavailable_from_hooks",
      cost: "estimated_from_external_source"
    });
    expect(parsed.adapter_capabilities).toContain("codex_hooks");
    expect(parsed.security.redaction).toEqual({
      status: "applied",
      raw_payloads_included: false
    });
  });

  test("omits raw secrets from JSON and Markdown exports by default", () => {
    const input = reportInput();

    const json = exportReport({ format: "json", report: input });
    const markdown = exportReport({ format: "markdown", report: input });

    for (const output of [json, markdown]) {
      expect(output).not.toContain("sk-test-1234567890");
      expect(output).not.toContain("secret-token");
      expect(output).toContain("[REDACTED]");
      expect(output).toContain("tool_calls_total");
      expect(output).toContain("limited");
    }
  });
});

function exportReport(input: ExportReportInput): string {
  return new ExportReportUseCase(new BenchmarkReportRenderer()).execute(input);
}

function reportInput() {
  return {
    run_id: "run_1",
    benchmark: { id: "login-validation", version: "1.0.0" },
    provider: "codex" as const,
    generated_at: "2026-06-20T12:05:00.000Z",
    metrics: [
      {
        metric: "tool_calls_total",
        value: 2,
        unit: "count",
        measurement_source: "derived" as const,
        capture_source: "normalized_events",
        confidence: "high" as const,
        run_id: "run_1",
        trial_id: "trial_1",
        provider: "codex" as const,
        observed_at: "2026-06-20T12:01:00.000Z",
        supporting_event_id: "evt_1"
      },
      {
        metric: "input_tokens",
        value: null,
        unit: "tokens",
        measurement_source: "unavailable" as const,
        capture_source: "none",
        confidence: "none" as const,
        run_id: "run_1",
        trial_id: "trial_1",
        provider: "codex" as const,
        observed_at: "2026-06-20T12:01:00.000Z"
      }
    ],
    evaluation: {
      score_total: 82.5,
      statistics: {
        trials: 1,
        inconclusive_trials: 0,
        mean: 82.5,
        median: 82.5,
        min: 82.5,
        max: 82.5,
        stddev: 0
      }
    },
    comparability: {
      status: "limited" as const,
      reasons: ["metric_source_limited:input_tokens"]
    },
    effective_observability: {
      tool_calls: "partial",
      tool_results: "partial",
      assistant_output: "derived",
      token_usage: "unavailable_from_hooks",
      context_usage: "unavailable_from_hooks",
      cost: "estimated_from_external_source"
    },
    adapter_capabilities: ["codex_hooks", "project_local_hooks"],
    security: {
      redaction: {
        status: "applied" as const,
        raw_payloads_included: false
      }
    },
    notes: [
      "Authorization: Bearer secret-token",
      "OPENAI_API_KEY=sk-test-1234567890"
    ],
    raw_payloads: [
      {
        body: "Authorization: Bearer secret-token OPENAI_API_KEY=sk-test-1234567890"
      }
    ]
  };
}
