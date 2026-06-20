import { describe, expect, test } from "vitest";
import { BenchmarkSchema } from "../../src/domain/benchmark/benchmark-schema.js";
import validBenchmark from "../fixtures/benchmarks/login-validation.benchmark.json" with { type: "json" };
import missingLimitsBenchmark from "../fixtures/benchmarks/missing-limits.benchmark.json" with { type: "json" };

describe("benchmark schema", () => {
  test("accepts a versioned benchmark with prompt, repo, limits, expected output, and evaluation", () => {
    const benchmark = BenchmarkSchema.parse(validBenchmark);

    expect(benchmark.id).toBe("login-validation-001");
    expect(benchmark.version).toBe("1.0.0");
    expect(benchmark.prompt.text).toContain("input validation");
  });

  test("rejects a benchmark without limits", () => {
    expect(() => BenchmarkSchema.parse(missingLimitsBenchmark)).toThrow();
  });

  test("rejects unsupported v1 harnesses", () => {
    expect(() =>
      BenchmarkSchema.parse({
        ...validBenchmark,
        harnesses: ["cursor"]
      })
    ).toThrow();
  });
});
