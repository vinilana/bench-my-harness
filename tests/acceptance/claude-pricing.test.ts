import { describe, expect, test } from "vitest";
import { calculateClaudeCostUsd } from "../../src/adapters/outbound/usage/claude-pricing.js";

const usage = {
  inputTokens: 10_000,
  outputTokens: 500,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 4_000
};

describe("Claude pricing estimates", () => {
  test("prices Claude Opus 4.8 instead of returning unavailable", () => {
    const cost = calculateClaudeCostUsd("claude-opus-4-8", usage);
    expect(cost).toBeDefined();
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeCloseTo(0.0645, 12);
  });

  test("prices the newly added current models", () => {
    expect(calculateClaudeCostUsd("claude-sonnet-4-6", usage)).toBeCloseTo(0.0387, 12);
    expect(calculateClaudeCostUsd("claude-fable-5", usage)).toBeCloseTo(0.129, 12);
  });

  test("does not collapse different versions onto the bare family price", () => {
    // The matcher deliberately refuses to match claude-opus-4 against
    // claude-opus-4-8, so the 4.8 entry must be priced from its own row.
    const opus48 = calculateClaudeCostUsd("claude-opus-4-8", usage);
    const opus4 = calculateClaudeCostUsd("claude-opus-4", usage);
    expect(opus48).not.toBeCloseTo(opus4 as number, 12);
  });
});
