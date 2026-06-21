import { z } from "zod";

import { BenchmarkSchema, SpecCatalogSchema, type Benchmark, type BenchmarkCategory, type SpecCatalog } from "./benchmark-schema.js";

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export const SPEC_GENERATED_GIT_DEFAULT_LIMIT = 25;

export interface LoadedFeatureSpec {
  readonly id: string;
  readonly tags: readonly string[];
  readonly catalogPath: string;
  readonly caseDirectory: string;
  readonly benchmark: Benchmark;
  readonly promptMarkdown: string;
}

export interface LoadedSpecCatalog {
  readonly catalog: SpecCatalog;
  readonly specs: readonly LoadedFeatureSpec[];
}

export type SpecCatalogDefaults = NonNullable<SpecCatalog["defaults"]>;

export interface CreateSpecCatalogInput {
  readonly id?: string;
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly trials?: number;
  readonly harnesses?: readonly ("codex" | "claude_code")[];
  readonly workspaceRoot?: string;
  readonly strictTelemetry?: boolean;
  readonly repoPath?: string;
  readonly category?: BenchmarkCategory;
  readonly setupCommands?: readonly string[];
  readonly testCommands?: readonly string[];
  readonly includeInSuite?: boolean;
}

export interface FeatureSpecAuthoringInput {
  readonly id: string;
  readonly name: string;
  readonly category: BenchmarkCategory;
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

export interface GeneratedGitCaseInput {
  readonly id: string;
  readonly name: string;
  readonly category: BenchmarkCategory;
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
      repo_path: input.repoPath ?? ".",
      category: input.category ?? "feature",
      trials: input.trials ?? 3,
      harnesses: input.harnesses ?? ["codex", "claude_code"],
      workspace_root: input.workspaceRoot ?? ".bmh/workspaces",
      strict_telemetry: input.strictTelemetry ?? false,
      setup_commands: [...(input.setupCommands ?? [])],
      test_commands: [...(input.testCommands ?? [])],
      include_in_suite: input.includeInSuite ?? true
    }
  });
}

export function createFeatureSpecDraft(input: FeatureSpecAuthoringInput): FeatureSpecDraft {
  const directory = caseDirectoryFor(input.id);
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

export function createGeneratedGitCase(input: GeneratedGitCaseInput): FeatureSpecDraft {
  const changedFiles = [...input.evidence.changedFiles].sort();
  const inferredTags = input.tags ?? inferTagsFromFiles(changedFiles);
  const behaviorHints = behaviorHintsFromCommitMessages(input.evidence.commitMessages);
  const promptMarkdown = [
    `# ${input.name}`,
    "",
    "## Goal",
    "",
    "Implement the behavior described below in the current repository.",
    "",
    "## Expected Behavior",
    "",
    ...behaviorHints,
    "",
    "## Constraints",
    "",
    "- Preserve public API compatibility unless the requested behavior requires a change.",
    "- Prefer the smallest change that satisfies validation commands.",
    ""
  ].join("\n");

  const draft = createFeatureSpecDraft({
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
    timeoutSeconds: input.timeoutSeconds,
    maxCostUsd: input.maxCostUsd,
    metadata: {
      source: "generated_git",
      generation_mode: "git_evidence",
      prompt_mode: "behavior_summary",
      bias_profile: "generated_from_history",
      commit_messages: [...input.evidence.commitMessages],
      changed_files: changedFiles,
      diff_summary: input.evidence.diffSummary
    }
  });

  return relocateFeatureSpecDraft(draft, `generated/git/${input.id}`);
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

export function validateGeneratedGitLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return SPEC_GENERATED_GIT_DEFAULT_LIMIT;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("add --from-git --range --limit must be a positive integer");
  }

  return limit;
}

export interface SpecAuthoringDefaultsInput {
  readonly id?: string;
  readonly name?: string;
  readonly category?: BenchmarkCategory;
  readonly repoPath?: string;
  readonly setupCommands?: readonly string[];
  readonly testCommands?: readonly string[];
  readonly includeInSuite?: boolean;
}

export interface ResolvedSpecAuthoringDefaults {
  readonly id: string;
  readonly name: string;
  readonly category: BenchmarkCategory;
  readonly repoPath: string;
  readonly setupCommands: readonly string[];
  readonly testCommands: readonly string[];
  readonly includeInSuite: boolean;
}

export function inferSpecIdFromPromptPath(path: string): string {
  const fileName = path.split(/[\\/]/).filter((segment) => segment.length > 0).at(-1) ?? path;
  const withoutExtension = fileName.replace(/\.md$/i, "");
  const withoutNumericPrefix = withoutExtension.replace(/^\d+[-_.\s]+/, "");
  const normalized = withoutNumericPrefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length === 0) {
    throw new Error(`could not infer spec id from prompt path: ${path}`);
  }

  validateSpecCatalogPath(normalized, "inferred spec id");
  return normalized;
}

export function inferSpecNameFromMarkdown(markdown: string, fallbackPath: string): string {
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\s{0,3}#\s+(.+?)\s*#*\s*$/.exec(line);
    const heading = match?.[1]?.trim();
    if (heading !== undefined && heading.length > 0) {
      return heading;
    }
  }

  return titleCase(inferSpecIdFromPromptPath(fallbackPath));
}

export function mergeSpecAuthoringDefaults(input: {
  readonly promptPath: string;
  readonly promptMarkdown: string;
  readonly catalogDefaults?: SpecCatalogDefaults;
  readonly overrides?: SpecAuthoringDefaultsInput;
}): ResolvedSpecAuthoringDefaults {
  const defaults = input.catalogDefaults;
  const overrides = input.overrides ?? {};

  return {
    id: overrides.id ?? inferSpecIdFromPromptPath(input.promptPath),
    name: overrides.name ?? inferSpecNameFromMarkdown(input.promptMarkdown, input.promptPath),
    category: overrides.category ?? defaults?.category ?? "feature",
    repoPath: overrides.repoPath ?? defaults?.repo_path ?? ".",
    setupCommands: [...(overrides.setupCommands ?? defaults?.setup_commands ?? [])],
    testCommands: [...(overrides.testCommands ?? defaults?.test_commands ?? [])],
    includeInSuite: overrides.includeInSuite ?? defaults?.include_in_suite ?? true
  };
}

export function generateDefaultSpecIdentity(seed = 0): { readonly id: string; readonly name: string } {
  const names = [
    "Ada Lovelace",
    "Alan Turing",
    "Grace Hopper",
    "Katherine Johnson",
    "Marie Curie",
    "Nikola Tesla",
    "Hypatia",
    "Ibn Sina",
    "Emmy Noether",
    "Srinivasa Ramanujan"
  ];
  const name = `${names[Math.abs(seed) % names.length]} Case`;

  return {
    id: inferSpecIdFromPromptPath(`${name}.md`),
    name
  };
}

function caseDirectoryFor(id: string): string {
  validateSpecCatalogPath(id, "spec id");
  return `cases/${id}`;
}

function relocateFeatureSpecDraft(draft: FeatureSpecDraft, directory: string): FeatureSpecDraft {
  validateSpecCatalogPath(directory, "spec directory");
  return {
    ...draft,
    directory,
    specPath: `${directory}/spec.md`,
    benchmarkPath: `${directory}/benchmark.json`,
    suiteReference: {
      ...draft.suiteReference,
      path: `${directory}/benchmark.json`
    }
  };
}

function behaviorHintsFromCommitMessages(messages: readonly string[]): readonly string[] {
  const hints = messages
    .map((message) => message.split(/\r?\n/)[0]?.trim())
    .filter((message): message is string => message !== undefined && message.length > 0)
    .map((message) => `- ${sentenceCase(message)}.`);

  return hints.length > 0 ? hints : ["- Implement the intended behavior for this generated benchmark case."];
}

function sentenceCase(value: string): string {
  const trimmed = value.replace(/\.$/, "");
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function titleCase(id: string): string {
  return id
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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
