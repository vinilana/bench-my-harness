import { describe, expect, test } from "vitest";
import { BenchmarkSchema } from "../../src/domain/benchmark/benchmark-schema.js";

describe("benchmark prompt file schema", () => {
  test("accepts a benchmark with inline prompt text", () => {
    const benchmark = BenchmarkSchema.parse({
      ...benchmarkFixture(),
      prompt: { text: "Add input validation to the login form." }
    });

    expect(benchmark.prompt.text).toBe("Add input validation to the login form.");
  });

  test("accepts a benchmark with a markdown prompt file", () => {
    const benchmark = BenchmarkSchema.parse({
      ...benchmarkFixture(),
      prompt: { file: "login-validation.spec.md" }
    });

    expect(benchmark.prompt.file).toBe("login-validation.spec.md");
  });

  test("rejects a prompt without text or file", () => {
    expect(() =>
      BenchmarkSchema.parse({
        ...benchmarkFixture(),
        prompt: {}
      })
    ).toThrow(/prompt/i);
  });

  test("rejects a prompt with both text and file", () => {
    expect(() =>
      BenchmarkSchema.parse({
        ...benchmarkFixture(),
        prompt: {
          text: "Do the work.",
          file: "task.spec.md"
        }
      })
    ).toThrow(/exactly one/i);
  });

  test("rejects prompt files that are not markdown", () => {
    expect(() =>
      BenchmarkSchema.parse({
        ...benchmarkFixture(),
        prompt: { file: "task.txt" }
      })
    ).toThrow(/\.md/i);
  });
});

function benchmarkFixture(): Record<string, unknown> {
  return {
    id: "prompt-file-schema-001",
    name: "Prompt file schema",
    version: "1.0.0",
    category: "feature",
    repo: {
      url: "file:///tmp/bmh/app",
      commit: "abc123",
      test_commands: ["npm test"]
    },
    expected_output: {
      tests_must_pass: true
    },
    limits: {
      timeout_seconds: 900
    },
    evaluation: {
      scoring: {
        tests: 1
      }
    }
  };
}
