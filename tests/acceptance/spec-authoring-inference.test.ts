import { describe, expect, test } from "vitest";

describe("spec authoring inference", () => {
  test("infers spec id from Markdown filename", async () => {
    const { inferSpecIdFromPromptPath } = await loadAuthoringHelpers();

    expect(inferSpecIdFromPromptPath("docs/specs/project-command-generation.md")).toBe("project-command-generation");
  });

  test("strips numeric prefixes from Markdown filenames", async () => {
    const { inferSpecIdFromPromptPath } = await loadAuthoringHelpers();

    expect(inferSpecIdFromPromptPath("docs/specs/15-project-command-generation.md")).toBe("project-command-generation");
  });

  test("normalizes spaced and capitalized filenames to kebab case", async () => {
    const { inferSpecIdFromPromptPath } = await loadAuthoringHelpers();

    expect(inferSpecIdFromPromptPath("docs/specs/Project Command Generation.md")).toBe("project-command-generation");
  });

  test("infers name from the first Markdown H1", async () => {
    const { inferSpecNameFromMarkdown } = await loadAuthoringHelpers();

    expect(inferSpecNameFromMarkdown("# Project Command Generation Spec\n\nBody text.\n")).toBe(
      "Project Command Generation Spec"
    );
  });

  test("falls back to title-cased filename when H1 is missing", async () => {
    const { inferSpecNameFromMarkdown } = await loadAuthoringHelpers();

    expect(inferSpecNameFromMarkdown("Body text without a heading.\n", "docs/specs/project-command-generation.md")).toBe(
      "Project Command Generation"
    );
  });

  test("merges suite defaults with explicit CLI overrides", async () => {
    const { mergeSpecAuthoringDefaults } = await loadAuthoringHelpers();

    expect(
      mergeSpecAuthoringDefaults({
        promptPath: "docs/specs/15-project-command-generation.md",
        promptMarkdown: "# Project Command Generation\n",
        catalogDefaults: {
          repo_path: ".",
          category: "feature",
          setup_commands: ["npm install"],
          test_commands: ["npm test", "npm run typecheck"],
          include_in_suite: true
        },
        overrides: {
          category: "bugfix",
          testCommands: ["npm run test:unit"],
          includeInSuite: false
        }
      })
    ).toEqual({
      id: "project-command-generation",
      name: "Project Command Generation",
      repoPath: ".",
      category: "bugfix",
      setupCommands: ["npm install"],
      testCommands: ["npm run test:unit"],
      includeInSuite: false
    });
  });
});

async function loadAuthoringHelpers(): Promise<{
  inferSpecIdFromPromptPath: (path: string) => string;
  inferSpecNameFromMarkdown: (markdown: string, promptPath?: string) => string;
  mergeSpecAuthoringDefaults: (input: {
    promptPath: string;
    promptMarkdown: string;
    catalogDefaults?: Record<string, unknown>;
    overrides?: Record<string, unknown>;
  }) => Record<string, unknown>;
}> {
  const module = (await import("../../src/domain/benchmark/spec-catalog.js")) as Record<string, unknown>;

  return {
    inferSpecIdFromPromptPath: requireFunction(module, "inferSpecIdFromPromptPath"),
    inferSpecNameFromMarkdown: requireFunction(module, "inferSpecNameFromMarkdown"),
    mergeSpecAuthoringDefaults: requireFunction(module, "mergeSpecAuthoringDefaults")
  };
}

function requireFunction<T extends (...args: never[]) => unknown>(module: Record<string, unknown>, name: string): T {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`expected src/domain/benchmark/spec-catalog.js to export ${name}`);
  }

  return value as T;
}
