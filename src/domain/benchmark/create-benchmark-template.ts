import { BenchmarkSchema, type Benchmark } from "./benchmark-schema.js";

export interface CreateBenchmarkTemplateInput {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly repoUrl?: string;
  readonly commit?: string;
  readonly fixturePath?: string;
  readonly setupCommands?: readonly string[];
  readonly testCommands?: readonly string[];
  readonly promptText?: string;
  readonly promptFile?: string;
  readonly constraints?: readonly string[];
  readonly timeoutSeconds?: number;
  readonly maxCostUsd?: number;
  readonly requiredFilesChanged?: readonly string[];
  readonly forbiddenFilesChanged?: readonly string[];
  readonly semanticRequirements?: readonly string[];
  readonly scoring?: Readonly<Record<string, number>>;
}

export function createBenchmarkTemplate(input: CreateBenchmarkTemplateInput): Benchmark {
  const hasRepo = input.repoUrl !== undefined;
  const hasFixture = input.fixturePath !== undefined;

  if (hasRepo === hasFixture) {
    throw new Error("Benchmark template must define exactly one of repoUrl or fixturePath");
  }

  const hasPromptText = input.promptText !== undefined;
  const hasPromptFile = input.promptFile !== undefined;

  if (hasPromptText === hasPromptFile) {
    throw new Error("Benchmark template must define exactly one prompt source");
  }

  const source = hasRepo
    ? {
        repo: {
          url: input.repoUrl,
          commit: input.commit,
          setup_commands: [...(input.setupCommands ?? [])],
          test_commands: [...(input.testCommands ?? [])]
        }
      }
    : {
        fixture: {
          path: input.fixturePath,
          setup_commands: [...(input.setupCommands ?? [])],
          test_commands: [...(input.testCommands ?? [])]
        }
      };

  const prompt = hasPromptText
    ? {
        text: input.promptText,
        constraints: [...(input.constraints ?? [])]
      }
    : {
        file: input.promptFile,
        constraints: [...(input.constraints ?? [])]
      };

  return BenchmarkSchema.parse({
    id: input.id,
    name: input.name,
    version: "1.0.0",
    category: input.category,
    ...source,
    prompt,
    expected_output: {
      tests_must_pass: true,
      required_files_changed: [...(input.requiredFilesChanged ?? [])],
      forbidden_files_changed: [...(input.forbiddenFilesChanged ?? [])],
      semantic_requirements: [...(input.semanticRequirements ?? [])]
    },
    limits: {
      timeout_seconds: input.timeoutSeconds ?? 900,
      max_cost_usd: input.maxCostUsd
    },
    evaluation: {
      scoring: input.scoring ?? { tests: 1 }
    }
  });
}
