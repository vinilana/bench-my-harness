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

  test("aggregates input, output, cache tokens, cost per token, interactions, and tool failures", () => {
    const report = buildSuiteReport({
      runId: "run_operational_metrics",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_1", {
          metrics: [
            metric("token_usage", 1500, "tokens", "native"),
            metric("input_tokens", 1000, "tokens", "native"),
            metric("output_tokens", 500, "tokens", "native"),
            metric("cache_read_tokens", 100, "tokens", "native"),
            metric("cache_write_tokens", 25, "tokens", "native"),
            metric("cost", 0.3, "usd", "estimated"),
            metric("agent_interactions_total", 2, "count", "derived"),
            metric("tool_calls_total", 4, "count", "derived"),
            metric("tool_calls_failed", 1, "count", "derived")
          ]
        }),
        trial("codex", "trial_2", {
          metrics: [
            metric("token_usage", 2500, "tokens", "native"),
            metric("input_tokens", 2000, "tokens", "native"),
            metric("output_tokens", 500, "tokens", "native"),
            metric("cache_read_tokens", 300, "tokens", "native"),
            metric("cache_write_tokens", 75, "tokens", "native"),
            metric("cost", 0.5, "usd", "estimated"),
            metric("agent_interactions_total", 1, "count", "derived"),
            metric("tool_calls_total", 2, "count", "derived"),
            metric("tool_calls_failed", 0, "count", "derived")
          ]
        })
      ]
    });

    expect(report.harness_summaries[0]).toEqual(expect.objectContaining({
      total_tokens: 4000,
      total_input_tokens: 3000,
      mean_input_tokens: 1500,
      total_output_tokens: 1000,
      mean_output_tokens: 500,
      total_cache_read_tokens: 400,
      total_cache_write_tokens: 100,
      total_cost_usd: 0.8,
      cost_per_1m_tokens: 200,
      total_tool_calls: 6,
      total_tool_failures: 1,
      mean_interactions: 1.5
    }));
    expect(report.observability).toEqual(expect.objectContaining({
      input_tokens: "native",
      output_tokens: "native",
      cache_read_tokens: "native",
      cache_write_tokens: "native",
      interactions: "derived",
      tool_calls: "derived",
      tool_failures: "derived"
    }));
  });

  test("derives cost per 1M tokens with source confidence and evidence references", () => {
    const report = buildSuiteReport({
      runId: "run_cost_per_token_evidence",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_1", {
          metrics: [
            metricWithEvidence("token_usage", 1000, "tokens", "native", "codex_session_transcript", "medium", ["transcript.jsonl"]),
            metricWithEvidence("cost", 0.2, "usd", "estimated", "openai_pricing_table", "low", ["transcript.jsonl", "pricing:openai"])
          ]
        }),
        trial("codex", "trial_2", {
          metrics: [
            metricWithEvidence("token_usage", 3000, "tokens", "native", "codex_session_transcript", "medium", ["transcript.jsonl"]),
            metricWithEvidence("cost", 0.6, "usd", "estimated", "openai_pricing_table", "low", ["transcript.jsonl", "pricing:openai"])
          ]
        })
      ]
    });

    expect(report.harness_summaries[0].cost_per_1m_tokens).toBe(200);
    expect(report.harness_summaries[0].cost_per_1m_tokens_metric).toEqual(expect.objectContaining({
      metric: "cost_per_1m_tokens",
      value: 200,
      unit: "usd_per_1m_tokens",
      measurement_source: "derived",
      capture_source: "suite_summary_ratio",
      confidence: "low",
      evidence_refs: ["transcript.jsonl", "pricing:openai"]
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

  test("does not mix native and estimated costs in one aggregate", () => {
    const report = buildSuiteReport({
      runId: "run_mixed_cost_sources",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("claude_code", "trial_1", {
          metrics: [metric("cost", 0.01, "usd", "native")]
        }),
        trial("claude_code", "trial_2", {
          metrics: [metric("cost", 0.02, "usd", "estimated")]
        })
      ]
    });

    expect(report.harness_summaries[0].total_cost_usd).toBeNull();
    expect(report.harness_summaries[0].mean_cost_usd).toBeNull();
    expect(report.observability.cost).toBe("limited");
    expect(report.comparability.status).toBe("limited");
    expect(report.comparability.reasons).toContain("metric_source_mismatch:cost:claude_code");
  });

  test("does not aggregate metrics with mismatched capture source, confidence, or unit", () => {
    const report = buildSuiteReport({
      runId: "run_mismatched_provenance",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_1", {
          metrics: [
            metricWithProvenance("token_usage", 1000, "tokens", "native", "codex_session_transcript", "medium")
          ]
        }),
        trial("codex", "trial_2", {
          metrics: [
            metricWithProvenance("token_usage", 900, "tokens", "native", "codex_cli_process_output", "low")
          ]
        })
      ]
    });

    expect(report.harness_summaries[0].total_tokens).toBeNull();
    expect(report.harness_summaries[0].mean_tokens).toBeNull();
    expect(report.observability.token_usage).toBe("limited");
    expect(report.comparability.status).toBe("limited");
    expect(report.comparability.reasons).toEqual(expect.arrayContaining([
      "metric_source_mismatch:token_usage:codex"
    ]));
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

  test("marks comparisons limited when models or adapter capabilities differ", () => {
    const report = buildSuiteReport({
      runId: "run_model_capability_mismatch",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_1", {
          metrics: [
            metricWithProvenance("token_usage", 1000, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("input_tokens", 700, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("output_tokens", 300, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("cost", 0.5, "usd", "native", "provider_usage", "high")
          ],
          usage: {
            llms: [{
              model: "gpt-5.5",
              provider: "openai",
              role: "primary",
              measurement_source: "native",
              capture_source: "test_fixture",
              confidence: "high"
            }]
          },
          adapter_capabilities: {
            provider: "codex",
            adapter_version: "codex-hooks@0.1.0",
            supported_provider_versions: ["codex hooks schema"],
            capabilities: { tool_lifecycle: "partial", token_usage: "native" },
            capability_evidence: {
              tool_lifecycle: ["tests/acceptance/spec-suite-usage-aggregation.test.ts"],
              token_usage: ["tests/acceptance/spec-suite-usage-aggregation.test.ts"]
            }
          }
        }),
        trial("claude_code", "trial_1", {
          metrics: [
            metricWithProvenance("token_usage", 1000, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("input_tokens", 700, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("output_tokens", 300, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("cost", 0.5, "usd", "native", "provider_usage", "high")
          ],
          usage: {
            llms: [{
              model: "claude-sonnet-4",
              provider: "anthropic",
              role: "primary",
              measurement_source: "native",
              capture_source: "test_fixture",
              confidence: "high"
            }]
          },
          adapter_capabilities: {
            provider: "claude_code",
            adapter_version: "claude-code-hooks@0.1.0",
            supported_provider_versions: ["claude-code hooks schema"],
            capabilities: { tool_lifecycle: "native", token_usage: "native" },
            capability_evidence: {
              tool_lifecycle: ["tests/acceptance/spec-suite-usage-aggregation.test.ts"],
              token_usage: ["tests/acceptance/spec-suite-usage-aggregation.test.ts"]
            }
          }
        })
      ]
    });

    expect(report.observability.token_usage).toBe("native");
    expect(report.observability.cost).toBe("native");
    expect(report.comparability.status).toBe("limited");
    expect(report.comparability.reasons).toEqual(expect.arrayContaining([
      "model_mismatch:gpt-5.5:claude-sonnet-4",
      "adapter_capability_mismatch:tool_lifecycle"
    ]));
  });

  test("marks comparisons limited when selected harness trials lack adapter capability matrices", () => {
    const report = buildSuiteReport({
      runId: "run_missing_capabilities",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_1", {
          metrics: [
            metricWithProvenance("token_usage", 1000, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("input_tokens", 700, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("output_tokens", 300, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("cost", 0.5, "usd", "native", "provider_usage", "high")
          ]
        }),
        trial("claude_code", "trial_1", {
          metrics: [
            metricWithProvenance("token_usage", 1000, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("input_tokens", 700, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("output_tokens", 300, "tokens", "native", "provider_usage", "high"),
            metricWithProvenance("cost", 0.5, "usd", "native", "provider_usage", "high")
          ]
        })
      ]
    });

    expect(report.observability.token_usage).toBe("native");
    expect(report.observability.cost).toBe("native");
    expect(report.comparability.status).toBe("limited");
    expect(report.comparability.reasons).toEqual(expect.arrayContaining([
      "adapter_capabilities_unavailable:codex",
      "adapter_capabilities_unavailable:claude_code"
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
  measurementSource: "native" | "estimated" | "derived"
): SuiteTrialReport["metrics"][number] {
  return {
    metric: name,
    value,
    unit,
    measurement_source: measurementSource,
    capture_source: measurementSource === "native"
      ? "provider_usage"
      : measurementSource === "estimated"
        ? "local_estimator"
        : "normalized_events",
    confidence: measurementSource === "native" ? "high" : measurementSource === "estimated" ? "low" : "high"
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

function metricWithProvenance(
  name: string,
  value: number,
  unit: string,
  measurementSource: "native" | "estimated" | "derived",
  captureSource: string,
  confidence: "high" | "medium" | "low"
): SuiteTrialReport["metrics"][number] {
  return {
    metric: name,
    value,
    unit,
    measurement_source: measurementSource,
    capture_source: captureSource,
    confidence
  };
}

function metricWithEvidence(
  name: string,
  value: number,
  unit: string,
  measurementSource: "native" | "estimated" | "derived",
  captureSource: string,
  confidence: "high" | "medium" | "low",
  evidenceRefs: readonly string[]
): SuiteTrialReport["metrics"][number] {
  return {
    ...metricWithProvenance(name, value, unit, measurementSource, captureSource, confidence),
    evidence_refs: evidenceRefs
  };
}
