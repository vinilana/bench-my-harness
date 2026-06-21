import { describe, expect, test } from "vitest";
import { calculateOpenAiCostUsd, parseOpenAiPricingMode } from "../../src/adapters/outbound/usage/openai-pricing.js";

const usage = {
  inputTokens: 10_000,
  cachedInputTokens: 4_000,
  outputTokens: 500
};

describe("OpenAI pricing estimates", () => {
  test("uses standard Codex pricing by default", () => {
    expect(calculateOpenAiCostUsd("gpt-5.3-codex", usage)).toBeCloseTo(0.0182, 12);
  });

  test("uses priority Codex pricing when explicitly configured", () => {
    expect(calculateOpenAiCostUsd("gpt-5.3-codex", usage, { mode: "priority" })).toBeCloseTo(0.0364, 12);
  });

  test("maps known Codex CLI aliases to Codex pricing", () => {
    expect(calculateOpenAiCostUsd("gpt-5.3-codex-max", usage)).toBeCloseTo(0.0182, 12);
  });

  test("does not price unknown model variants by partial string match", () => {
    expect(calculateOpenAiCostUsd("gpt-5.5-pro", usage)).toBeUndefined();
    expect(calculateOpenAiCostUsd("gpt-5.4-cyber", usage)).toBeUndefined();
    expect(calculateOpenAiCostUsd("gpt-5.1-codex-max", usage)).toBeUndefined();
  });

  test("uses the dedicated nano price instead of the gpt-5.4 family price", () => {
    expect(calculateOpenAiCostUsd("gpt-5.4-nano", usage)).toBeCloseTo(0.001905, 12);
  });

  test("accepts exact model snapshots without accepting arbitrary suffixes", () => {
    expect(calculateOpenAiCostUsd("gpt-5.4-2026-01-01", usage)).toBeCloseTo(0.0235, 12);
    expect(calculateOpenAiCostUsd("gpt-5.4-custom", usage)).toBeUndefined();
  });

  test("parses explicit pricing mode configuration", () => {
    expect(parseOpenAiPricingMode("priority")).toBe("priority");
    expect(parseOpenAiPricingMode(" STANDARD ")).toBe("standard");
    expect(parseOpenAiPricingMode("fast")).toBeUndefined();
  });
});
