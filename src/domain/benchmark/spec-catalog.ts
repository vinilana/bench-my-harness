import { z } from "zod";

import { BenchmarkSchema, SpecCatalogSchema, type Benchmark, type SpecCatalog } from "./benchmark-schema.js";

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export const SPEC_BACKFILL_DEFAULT_LIMIT = 25;

export interface LoadedFeatureSpec {
  readonly id: string;
  readonly tags: readonly string[];
  readonly catalogPath: string;
  readonly featureDirectory: string;
  readonly benchmark: Benchmark;
  readonly promptMarkdown: string;
}

export interface LoadedSpecCatalog {
  readonly catalog: SpecCatalog;
  readonly specs: readonly LoadedFeatureSpec[];
}

export interface CreateSpecCatalogInput {
  readonly id?: string;
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly trials?: number;
  readonly harnesses?: readonly ("codex" | "claude_code")[];
  readonly workspaceRoot?: string;
  readonly strictTelemetry?: boolean;
}

export interface FeatureSpecAuthoringInput {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly difficulty?: string;
  readonly tags?: readonly string[];
  readonly repoUrl: string;
  readonly baseRef?: string;
  readonly goldenRef?: string;
  readonly setupCommands?: readonly string[];
  readonly testCommands?: readonly string[];
  readonly promptMarkdown: string;
  readonly constraints?: readonly string[];
  readonly timeoutSeconds?: number;
  readonly maxCostUsd?: number;
  readonly requiredFilesChanged?: readonly string[];
  readonly forbiddenFilesChanged?: readonly string[];
  readonly semanticRequirements?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface FeatureSpecDraft {
  readonly directory: string;
  readonly specPath: string;
  readonly benchmarkPath: string;
  readonly suiteReference: {
    readonly id: string;
    readonly path: string;
    readonly tags?: readonly string[];
  };
  readonly specMarkdown: string;
  readonly benchmark: Benchmark;
}

export interface GitHistoryEvidence {
  readonly baseRef: string;
  readonly goldenRef: string;
  readonly changedFiles: readonly string[];
  readonly commitMessages: readonly string[];
  readonly diffSummary?: string;
}

export interface BackwardSpecDraftInput {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly repoUrl: string;
  readonly evidence: GitHistoryEvidence;
  readonly setupCommands?: readonly string[];
  readonly testCommands?: readonly string[];
  readonly tags?: readonly string[];
  readonly timeoutSeconds?: number;
  readonly maxCostUsd?: number;
}

export function createSpecCatalog(input: CreateSpecCatalogInput = {}): SpecCatalog {
  return SpecCatalogSchema.parse({
    id: input.id ?? "local-specs",
    name: input.name ?? "Local specs",
    version: input.version ?? "1.0.0",
    description: input.description,
    specs: [],
    defaults: {
      trials: input.trials ?? 3,
      harnesses: input.harnesses ?? ["codex", "claude_code"],
      workspace_root: input.workspaceRoot ?? ".bmh/workspaces",
      strict_telemetry: input.strictTelemetry ?? false
    }
  });
}

export function createFeatureSpecDraft(input: FeatureSpecAuthoringInput): FeatureSpecDraft {
  const directory = featureDirectoryFor(input.id);
  const specPath = `${directory}/spec.md`;
  const benchmarkPath = `${directory}/benchmark.json`;
  const tags = [...(input.tags ?? [])];
  const benchmark = BenchmarkSchema.parse({
    id: input.id,
    name: input.name,
    version: "1.0.0",
    category: input.category,
    difficulty: input.difficulty,
    tags,
    repo: {
      url: input.repoUrl,
      base_ref: input.baseRef,
      golden_ref: input.goldenRef,
      setup_commands: [...(input.setupCommands ?? [])],
      test_commands: [...(input.testCommands ?? [])]
    },
    prompt: {
      file: "spec.md",
      constraints: [...(input.constraints ?? [])]
    },
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
      scoring: {
        tests: 0.5,
        semantic_requirements: 0.25,
        diff_quality: 0.1,
        cost_efficiency: 0.1,
        constraints: 0.05
      }
    },
    metadata: input.metadata ?? {
      source: "manual_cli"
    }
  });

  return {
    directory,
    specPath,
    benchmarkPath,
    suiteReference: {
      id: input.id,
      path: benchmarkPath,
      tags: tags.length > 0 ? tags : undefined
    },
    specMarkdown: input.promptMarkdown,
    benchmark
  };
}

export function createBackwardSpecDraft(input: BackwardSpecDraftInput): FeatureSpecDraft {
  const changedFiles = [...input.evidence.changedFiles].sort();
  const inferredTags = input.tags ?? inferTagsFromFiles(changedFiles);
  const promptMarkdown = [
    `# ${input.name}`,
    "",
    "## Goal",
    "",
    `Re-implement the behavior introduced between \`${input.evidence.baseRef}\` and \`${input.evidence.goldenRef}\`.`,
    "",
    "## Evidence From Existing Implementation",
    "",
    "- Changed files:",
    ...changedFiles.map((file) => `  - \`${file}\``),
    "",
    "## Expected Behavior",
    "",
    "TODO: Review and replace this section with product-level requirements.",
    "",
    "## Constraints",
    "",
    "- Preserve public API compatibility unless the historical diff proves otherwise.",
    "- Prefer the smallest change that satisfies validation commands.",
    ""
  ].join("\n");

  return createFeatureSpecDraft({
    id: input.id,
    name: input.name,
    category: input.category,
    repoUrl: input.repoUrl,
    baseRef: input.evidence.baseRef,
    goldenRef: input.evidence.goldenRef,
    setupCommands: input.setupCommands,
    testCommands: input.testCommands,
    promptMarkdown,
    tags: inferredTags,
    requiredFilesChanged: changedFiles,
    semanticRequirements: ["TODO: Human review required for product-level requirements."],
    timeoutSeconds: input.timeoutSeconds,
    maxCostUsd: input.maxCostUsd,
    metadata: {
      source: "backward_git_draft",
      review_status: "needs_human_review",
      commit_messages: [...input.evidence.commitMessages],
      diff_summary: input.evidence.diffSummary
    }
  });
}

export function addSpecToCatalog(catalog: SpecCatalog, reference: FeatureSpecDraft["suiteReference"]): SpecCatalog {
  const withoutExisting = catalog.specs.filter((spec) => spec.id !== reference.id);

  return SpecCatalogSchema.parse({
    ...catalog,
    specs: [...withoutExisting, reference]
  });
}

export function validateSpecCatalogPath(path: string, label = "catalog path"): string {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    throw new Error(`${label} must be a relative path inside .bmh/specs`);
  }

  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${label} must not escape .bmh/specs`);
  }

  if (!segments.every((segment) => SAFE_SEGMENT_PATTERN.test(segment))) {
    throw new Error(`${label} contains unsupported characters`);
  }

  return path;
}

export function validateBackfillLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return SPEC_BACKFILL_DEFAULT_LIMIT;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("specs backfill --limit must be a positive integer");
  }

  return limit;
}

function featureDirectoryFor(id: string): string {
  validateSpecCatalogPath(id, "spec id");
  return `features/${id}`;
}

function inferTagsFromFiles(files: readonly string[]): readonly string[] {
  const tags = new Set<string>();
  for (const file of files) {
    if (file.includes(".test.") || file.includes(".spec.") || file.startsWith("test/") || file.startsWith("tests/")) {
      tags.add("tests");
    }

    const [first] = file.split("/");
    if (first && first !== "src" && first !== "tests") {
      tags.add(first);
    }
  }

  return [...tags].sort();
}

export function parseSpecCatalog(value: unknown): SpecCatalog {
  return SpecCatalogSchema.parse(value);
}

export function parseFeatureBenchmark(value: unknown): Benchmark {
  return BenchmarkSchema.parse(value);
}

export function validateCatalogBenchmark(benchmark: Benchmark): void {
  if (benchmark.repo !== undefined && benchmark.repo.base_ref === undefined) {
    throw new Error(`catalog benchmark ${benchmark.id} must define repo.base_ref`);
  }

  if (benchmark.prompt.file === undefined) {
    throw new Error(`catalog benchmark ${benchmark.id} must use prompt.file`);
  }

  validateSpecCatalogPath(benchmark.prompt.file, "prompt file");
}

export function formatZodError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
  }

  return error instanceof Error ? error.message : String(error);
}
