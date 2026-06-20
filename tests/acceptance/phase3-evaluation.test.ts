import { describe, expect, test } from "vitest";
import { evaluateBenchmark } from "../../src/application/use-cases/evaluate-benchmark.js";

describe("phase 3 evaluation", () => {
  test("calculates initial score with documented weights and evidence", () => {
    const result = evaluateBenchmark({
      runId: "run_1",
      provider: "codex",
      trials: [
        {
          trial_id: "trial_1",
          components: {
            tests: { score: 1, evidence: ["sha256:test-output"] },
            functional: { score: 0.8, evidence: ["req:validates_email"] },
            diff_quality: { score: 0.5, evidence: ["sha256:diff"] },
            efficiency: { score: 0.25, evidence: ["metric:duration_ms"] },
            restrictions: { score: 1, evidence: ["constraint:no-network"] }
          }
        }
      ]
    });

    expect(result.trial_scores[0]).toEqual(expect.objectContaining({
      trial_id: "trial_1",
      score_total: 82.5
    }));
    expect(result.trial_scores[0]?.components.tests).toEqual({
      score: 1,
      weight: 0.5,
      weighted_score: 50,
      evidence: ["sha256:test-output"]
    });
    expect(result.weights).toEqual({
      tests: 0.5,
      functional: 0.25,
      diff_quality: 0.1,
      efficiency: 0.1,
      restrictions: 0.05
    });
  });

  test("reports minimum statistics across conclusive trials", () => {
    const result = evaluateBenchmark({
      runId: "run_1",
      provider: "claude_code",
      trials: [
        { trial_id: "trial_1", components: perfectComponents() },
        { trial_id: "trial_2", components: halfComponents() },
        { trial_id: "trial_3", inconclusive: true, components: perfectComponents() }
      ]
    });

    expect(result.statistics).toEqual(expect.objectContaining({
      trials: 2,
      inconclusive_trials: 1,
      mean: 75,
      median: 75,
      min: 50,
      max: 100
    }));
    expect(result.statistics.stddev).toBe(25);
  });
});

function perfectComponents() {
  return {
    tests: { score: 1, evidence: ["tests"] },
    functional: { score: 1, evidence: ["functional"] },
    diff_quality: { score: 1, evidence: ["diff"] },
    efficiency: { score: 1, evidence: ["efficiency"] },
    restrictions: { score: 1, evidence: ["restrictions"] }
  };
}

function halfComponents() {
  return {
    tests: { score: 0.5, evidence: ["tests"] },
    functional: { score: 0.5, evidence: ["functional"] },
    diff_quality: { score: 0.5, evidence: ["diff"] },
    efficiency: { score: 0.5, evidence: ["efficiency"] },
    restrictions: { score: 0.5, evidence: ["restrictions"] }
  };
}
