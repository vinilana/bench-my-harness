import { z } from "zod";

import { HarnessProviderSchema } from "../events/normalized-event.js";

const NonEmptyStringSchema = z.string().min(1);
const CommandListSchema = z.array(NonEmptyStringSchema);
export const BenchmarkCategorySchema = z.enum([
  "feature",
  "bugfix",
  "refactor",
  "performance",
  "security",
  "test",
  "docs",
  "maintenance",
  "other"
]);

const RepoSchema = z.object({
  url: NonEmptyStringSchema,
  commit: NonEmptyStringSchema.optional(),
  base_ref: NonEmptyStringSchema.optional(),
  golden_ref: NonEmptyStringSchema.optional(),
  setup_commands: CommandListSchema.optional(),
  test_commands: CommandListSchema.optional()
});

const FixtureSchema = z.object({
  path: NonEmptyStringSchema,
  setup_commands: CommandListSchema.optional(),
  test_commands: CommandListSchema.optional()
});

const PromptSchema = z.object({
  text: NonEmptyStringSchema.optional(),
  file: NonEmptyStringSchema.refine((value) => value.endsWith(".md"), {
    message: "prompt.file must end with .md"
  }).optional(),
  attachments: z.array(NonEmptyStringSchema).optional(),
  constraints: z.array(NonEmptyStringSchema).optional()
}).refine((prompt) => (prompt.text === undefined) !== (prompt.file === undefined), {
  message: "Prompt must define exactly one of text or file"
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
  category: BenchmarkCategorySchema,
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
  }).catchall(z.unknown()).optional()
}).refine((benchmark) => benchmark.repo !== undefined || benchmark.fixture !== undefined, {
  message: "Benchmark must define either repo or fixture",
  path: ["repo"]
});

export const SpecCatalogReferenceSchema = z.object({
  id: NonEmptyStringSchema,
  path: NonEmptyStringSchema,
  tags: z.array(NonEmptyStringSchema).optional()
}).superRefine((reference, context) => {
  if (!isSafeCatalogRelativePath(reference.path)) {
    context.addIssue({
      code: "custom",
      path: ["path"],
      message: "spec path must be relative and must not escape .bmh/specs"
    });
  }
});

export const SpecCatalogSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  version: NonEmptyStringSchema,
  description: NonEmptyStringSchema.optional(),
  specs: z.array(SpecCatalogReferenceSchema),
  defaults: z.object({
    repo_path: NonEmptyStringSchema.optional(),
    category: BenchmarkCategorySchema.optional(),
    trials: z.number().int().positive().optional(),
    harnesses: z.array(HarnessProviderSchema).optional(),
    workspace_root: NonEmptyStringSchema.optional(),
    strict_telemetry: z.boolean().optional(),
    setup_commands: CommandListSchema.optional(),
    test_commands: CommandListSchema.optional(),
    include_in_suite: z.boolean().optional()
  }).optional()
});

export type Benchmark = z.infer<typeof BenchmarkSchema>;
export type BenchmarkCategory = z.infer<typeof BenchmarkCategorySchema>;
export type SpecCatalog = z.infer<typeof SpecCatalogSchema>;
export type SpecCatalogReference = z.infer<typeof SpecCatalogReferenceSchema>;

function isSafeCatalogRelativePath(path: string): boolean {
  if (path.length === 0 || path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path)) {
    return false;
  }

  return path.split(/[\\/]/).every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
