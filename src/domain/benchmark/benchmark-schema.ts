import { z } from "zod";

import { HarnessProviderSchema } from "../events/normalized-event.js";

const NonEmptyStringSchema = z.string().min(1);
const CommandListSchema = z.array(NonEmptyStringSchema);

const RepoSchema = z.object({
  url: NonEmptyStringSchema,
  commit: NonEmptyStringSchema.optional(),
  setup_commands: CommandListSchema.optional(),
  test_commands: CommandListSchema.optional()
});

const FixtureSchema = z.object({
  path: NonEmptyStringSchema,
  setup_commands: CommandListSchema.optional(),
  test_commands: CommandListSchema.optional()
});

const PromptSchema = z.object({
  text: NonEmptyStringSchema,
  attachments: z.array(NonEmptyStringSchema).optional(),
  constraints: z.array(NonEmptyStringSchema).optional()
});

const ExpectedOutputSchema = z.object({
  tests_must_pass: z.boolean().optional(),
  required_files_changed: z.array(NonEmptyStringSchema).optional(),
  forbidden_files_changed: z.array(NonEmptyStringSchema).optional(),
  semantic_requirements: z.array(NonEmptyStringSchema).optional()
});

const LimitsSchema = z.object({
  timeout_seconds: z.number().int().positive(),
  max_cost_usd: z.number().nonnegative().optional(),
  max_input_tokens: z.number().int().positive().optional(),
  max_output_tokens: z.number().int().positive().optional()
});

const EvaluationSchema = z.object({
  scoring: z.record(NonEmptyStringSchema, z.number().nonnegative())
});

export const BenchmarkSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  version: NonEmptyStringSchema,
  category: NonEmptyStringSchema,
  difficulty: NonEmptyStringSchema.optional(),
  tags: z.array(NonEmptyStringSchema).optional(),
  harnesses: z.array(HarnessProviderSchema).optional(),
  repo: RepoSchema.optional(),
  fixture: FixtureSchema.optional(),
  prompt: PromptSchema,
  expected_output: ExpectedOutputSchema,
  limits: LimitsSchema,
  evaluation: EvaluationSchema,
  permissions: z.record(NonEmptyStringSchema, z.unknown()).optional(),
  network_policy: NonEmptyStringSchema.optional(),
  model_policy: NonEmptyStringSchema.optional(),
  metadata: z.object({
    created_by: NonEmptyStringSchema.optional(),
    tags: z.array(NonEmptyStringSchema).optional()
  }).optional()
}).refine((benchmark) => benchmark.repo !== undefined || benchmark.fixture !== undefined, {
  message: "Benchmark must define either repo or fixture",
  path: ["repo"]
});

export type Benchmark = z.infer<typeof BenchmarkSchema>;
