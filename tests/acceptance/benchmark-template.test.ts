import { describe, expect, test } from "vitest";
import { CreateBenchmarkTemplateUseCase } from "../../src/application/use-cases/create-benchmark-template.js";
import { BenchmarkSchema } from "../../src/domain/benchmark/benchmark-schema.js";

describe("benchmark template use case", () => {
  test("creates a minimal valid benchmark with defaults", () => {
    const benchmark = new CreateBenchmarkTemplateUseCase().execute({
      id: "template-001",
      name: "Template benchmark",
      category: "feature",
      repoUrl: "file:///tmp/bmh/app",
      commit: "abc123",
      promptText: "Implement the feature.",
      testCommands: ["npm test"]
    });

    expect(BenchmarkSchema.parse(benchmark)).toMatchObject({
      id: "template-001",
      name: "Template benchmark",
      version: "1.0.0",
      category: "feature",
      repo: {
        url: "file:///tmp/bmh/app",
        commit: "abc123",
        test_commands: ["npm test"]
      },
      prompt: {
        text: "Implement the feature."
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
    });
  });

  test("creates fixture-based benchmarks", () => {
    const benchmark = new CreateBenchmarkTemplateUseCase().execute({
      id: "fixture-template-001",
      name: "Fixture template",
      category: "bugfix",
      fixturePath: "fixtures/login",
      promptText: "Fix the bug.",
      testCommands: ["npm test"]
    });

    expect(benchmark).toMatchObject({
      fixture: {
        path: "fixtures/login",
        test_commands: ["npm test"]
      }
    });
    expect(benchmark).not.toHaveProperty("repo");
  });

  test("supports markdown prompt files instead of inline text", () => {
    const benchmark = new CreateBenchmarkTemplateUseCase().execute({
      id: "template-prompt-file-001",
      name: "Template prompt file",
      category: "feature",
      repoUrl: "file:///tmp/bmh/app",
      promptFile: "task.spec.md",
      testCommands: ["npm test"]
    });

    expect(benchmark.prompt).toMatchObject({ file: "task.spec.md" });
    expect(benchmark.prompt).not.toHaveProperty("text");
  });

  test("rejects input with neither repo nor fixture", () => {
    expect(() =>
      new CreateBenchmarkTemplateUseCase().execute({
        id: "missing-source-001",
        name: "Missing source",
        category: "feature",
        promptText: "Do the work.",
        testCommands: ["npm test"]
      })
    ).toThrow(/repo|fixture/i);
  });

  test("rejects input with both repo and fixture", () => {
    expect(() =>
      new CreateBenchmarkTemplateUseCase().execute({
        id: "two-sources-001",
        name: "Two sources",
        category: "feature",
        repoUrl: "file:///tmp/bmh/app",
        fixturePath: "fixtures/app",
        promptText: "Do the work.",
        testCommands: ["npm test"]
      })
    ).toThrow(/repo|fixture/i);
  });

  test("rejects inline prompt text and prompt file together", () => {
    expect(() =>
      new CreateBenchmarkTemplateUseCase().execute({
        id: "two-prompts-001",
        name: "Two prompts",
        category: "feature",
        repoUrl: "file:///tmp/bmh/app",
        promptText: "Do the work.",
        promptFile: "task.spec.md",
        testCommands: ["npm test"]
      })
    ).toThrow(/prompt/i);
  });
});
