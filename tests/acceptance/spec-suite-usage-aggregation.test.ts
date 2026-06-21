import { describe, expect, test } from "vitest";

import {
  buildSuiteReport,
  type SuiteTrialReport
} from "../../src/domain/reports/suite-report.js";

describe("spec suite usage aggregation", () => {
  test("aggregates duration, native tokens, and native cost by harness", () => {
    const report = buildSuiteReport({
      runId: "run_usage_aggregation",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_1", {
          duration_ms: 100,
          metrics: [
            metric("token_usage", 1000, "tokens", "native"),
            metric("cost", 0.4, "usd", "native")
          ]
        }),
        trial("codex", "trial_2", {
          duration_ms: 300,
          metrics: [
            metric("token_usage", 2000, "tokens", "native"),
            metric("cost", 0.6, "usd", "native")
          ]
        }),
        trial("claude_code", "trial_1", {
          duration_ms: 50,
          metrics: [
            metric("token_usage", 500, "tokens", "native"),
            metric("cost", 0.2, "usd", "native")
          ]
        })
      ]
    });

    const codex = report.harness_summaries.find((summary) => summary.harness === "codex");
    const claude = report.harness_summaries.find((summary) => summary.harness === "claude_code");

    expect(codex).toEqual(expect.objectContaining({
      mean_duration_ms: 200,
      total_tokens: 3000,
      mean_tokens: 1500,
      total_cost_usd: 1,
      mean_cost_usd: 0.5
    }));
    expect(claude).toEqual(expect.objectContaining({
      mean_duration_ms: 50,
      total_tokens: 500,
      mean_tokens: 500,
      total_cost_usd: 0.2,
      mean_cost_usd: 0.2
    }));
  });

  test("does not mix native and estimated token totals in one aggregate", () => {
    const report = buildSuiteReport({
      runId: "run_mixed_sources",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_1", {
          metrics: [metric("token_usage", 1000, "tokens", "native")]
        }),
        trial("codex", "trial_2", {
          metrics: [metric("token_usage", 900, "tokens", "estimated")]
        })
      ]
    });

    expect(report.harness_summaries[0].total_tokens).toBeNull();
    expect(report.harness_summaries[0].mean_tokens).toBeNull();
    expect(report.observability.token_usage).toBe("limited");
    expect(report.comparability.status).toBe("limited");
    expect(report.comparability.reasons).toContain("metric_source_mismatch:token_usage:codex");
  });

  test("marks cost unavailable and token comparison limited when metrics are missing", () => {
    const report = buildSuiteReport({
      runId: "run_unavailable",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_1", {
          metrics: [
            metric("token_usage", 1200, "tokens", "native"),
            unavailableMetric("cost", "no native billing or pricing source configured")
          ]
        }),
        trial("claude_code", "trial_1", {
          metrics: [
            unavailableMetric("token_usage", "provider did not expose total token usage"),
            unavailableMetric("cost", "no native billing or pricing source configured")
          ]
        })
      ]
    });

    expect(report.harness_summaries.map((summary) => [summary.harness, summary.total_cost_usd])).toEqual([
      ["codex", null],
      ["claude_code", null]
    ]);
    expect(report.observability.cost).toBe("unavailable");
    expect(report.observability.token_usage).toBe("limited");
    expect(report.comparability.status).toBe("limited");
    expect(report.comparability.reasons).toEqual(expect.arrayContaining([
      "metric_unavailable:cost",
      "metric_unavailable:token_usage:claude_code"
    ]));
  });
});

function trial(
  harness: "codex" | "claude_code",
  trialId: string,
  overrides: Partial<SuiteTrialReport> = {}
): SuiteTrialReport {
  return {
    spec_id: "usage-observability",
    spec_version: "1.0.0",
    harness,
    trial_id: trialId,
    status: "completed",
    score: 1,
    duration_ms: undefined,
    tags: ["observability"],
    artifact_refs: [`specs/usage-observability/${harness}/${trialId}/result.json`],
    comparability: { status: "comparable", reasons: [] },
    metrics: [],
    notes: [],
    ...overrides
  };
}

function metric(
  name: string,
  value: number,
  unit: string,
  measurementSource: "native" | "estimated"
): SuiteTrialReport["metrics"][number] {
  return {
    metric: name,
    value,
    unit,
    measurement_source: measurementSource,
    capture_source: measurementSource === "native" ? "provider_usage" : "local_estimator",
    confidence: measurementSource === "native" ? "high" : "low"
  };
}

function unavailableMetric(
  name: string,
  unavailableReason: string
): SuiteTrialReport["metrics"][number] {
  return {
    metric: name,
    value: null,
    measurement_source: "unavailable",
    capture_source: "usage_capture",
    confidence: "none",
    unavailable_reason: unavailableReason
  };
}
