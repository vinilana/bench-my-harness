import { describe, expect, test } from "vitest";
import { InMemoryUsageCapture } from "../../src/adapters/outbound/usage/in-memory-usage-capture.js";
import { compareRuns } from "../../src/domain/comparison/compare-runs.js";

describe("usage capture and comparability", () => {
  test("records unavailable usage explicitly when no source exists", async () => {
    const usage = new InMemoryUsageCapture({ available: false });

    const observations = await usage.capture({ provider: "codex", runId: "run_1", trialId: "trial_1" });

    expect(observations).toContainEqual(
      expect.objectContaining({
        metric: "input_tokens",
        measurement_source: "unavailable",
        confidence: "none"
      })
    );
  });

  test("does not mark runs comparable when token sources are incompatible", () => {
    const decision = compareRuns({
      baseline: {
        run_id: "run_a",
        benchmark_version: "1.0.0",
        model_policy: "same-model",
        permission_profile: "default",
        metrics: [{ metric: "input_tokens", measurement_source: "native" }]
      },
      candidate: {
        run_id: "run_b",
        benchmark_version: "1.0.0",
        model_policy: "same-model",
        permission_profile: "default",
        metrics: [{ metric: "input_tokens", measurement_source: "estimated" }]
      }
    });

    expect(decision.status).toBe("limited");
    expect(decision.reasons).toContain("metric_source_mismatch:input_tokens");
  });

  test("marks runs not comparable when benchmark versions differ", () => {
    const decision = compareRuns({
      baseline: {
        run_id: "run_a",
        benchmark_version: "1.0.0",
        model_policy: "same-model",
        permission_profile: "default",
        metrics: []
      },
      candidate: {
        run_id: "run_b",
        benchmark_version: "2.0.0",
        model_policy: "same-model",
        permission_profile: "default",
        metrics: []
      }
    });

    expect(decision.status).toBe("not_comparable");
    expect(decision.reasons).toContain("benchmark_version_mismatch");
  });
});
