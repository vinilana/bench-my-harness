import { generateDefaultSpecIdentity } from "../../../domain/benchmark/spec-catalog.js";
import {
  BenchmarkCategorySchema,
  type BenchmarkCategory
} from "../../../domain/benchmark/benchmark-schema.js";
import type { SpecCatalogDefaults } from "../../../domain/benchmark/spec-catalog.js";
import { PromptCancelledError, type Prompter, type SelectOption } from "./prompter.js";

export interface BenchmarkAuthoringCommand {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly repoUrl?: string;
  readonly fixturePath?: string;
  readonly commit?: string;
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
}

export interface InteractiveBenchmarkAuthoringOptions {
  readonly prompter: Prompter;
  readonly generateCommands?: (repoUrlOrPath: string) => Promise<{
    readonly setupCommands: readonly string[];
    readonly testCommands: readonly string[];
  }>;
  readonly isLocalRepoPath?: (value: string) => boolean;
  readonly defaults?: SpecCatalogDefaults;
}

export class InteractiveBenchmarkAuthoring {
  public constructor(private readonly options: InteractiveBenchmarkAuthoringOptions) {}

  public async collect(): Promise<BenchmarkAuthoringCommand> {
    const prompter = this.options.prompter;
    const identity = generateDefaultSpecIdentity();
    const category = await prompter.select<BenchmarkCategory>({
      message: "Category",
      options: categoryOptions(),
      initialValue: this.options.defaults?.category ?? "feature"
    });
    const source = await prompter.select({
      message: "Source",
      options: [
        { value: "repo", hint: "local path or git URL" },
        { value: "fixture", hint: "fixture directory" }
      ] as const,
      initialValue: "repo"
    });

    let repoUrl: string | undefined;
    let fixturePath: string | undefined;
    let commit: string | undefined;
    let setupCommands: readonly string[];
    let testCommands: readonly string[];

    if (source === "repo") {
      repoUrl = await prompter.text({
        message: "Repo URL or path",
        defaultValue: this.options.defaults?.repo_path ?? "."
      });
      commit = optional(await prompter.text({ message: "Commit" }));
      const generatedCommands = await this.tryGenerateCommands(repoUrl);
      setupCommands = generatedCommands?.setupCommands ?? parseList(
        await prompter.text({ message: "Setup commands", defaultValue: formatList(this.options.defaults?.setup_commands) }),
        this.options.defaults?.setup_commands
      );
      testCommands = generatedCommands?.testCommands ?? parseList(
        await prompter.text({ message: "Test commands", defaultValue: formatList(this.options.defaults?.test_commands) }),
        this.options.defaults?.test_commands
      );
    } else {
      fixturePath = await prompter.text({ message: "Fixture path", validate: requireNonEmpty("fixture path") });
      setupCommands = parseList(
        await prompter.text({ message: "Setup commands", defaultValue: formatList(this.options.defaults?.setup_commands) }),
        this.options.defaults?.setup_commands
      );
      testCommands = parseList(
        await prompter.text({ message: "Test commands", defaultValue: formatList(this.options.defaults?.test_commands) }),
        this.options.defaults?.test_commands
      );
    }

    const promptSource = await prompter.select({
      message: "Prompt source",
      options: [
        { value: "text", hint: "type the prompt inline" },
        { value: "file", hint: "reference a Markdown file" }
      ] as const,
      initialValue: "text"
    });
    let promptText: string | undefined;
    let promptFile: string | undefined;

    if (promptSource === "text") {
      promptText = await prompter.text({ message: "Prompt text", validate: requireNonEmpty("prompt text") });
    } else {
      promptFile = await prompter.text({ message: "Prompt Markdown file", validate: requireNonEmpty("prompt Markdown file") });
    }

    const constraints = parseList(await prompter.text({ message: "Constraints" }));
    const timeoutSeconds = parsePositiveNumber(
      await prompter.text({ message: "Timeout seconds", validate: optionalPositiveNumber("timeout seconds") })
    );
    const maxCostUsd = parseNonnegativeNumber(
      await prompter.text({ message: "Max cost USD", validate: optionalNonnegativeNumber("max cost USD") })
    );
    const requiredFilesChanged = parseList(await prompter.text({ message: "Required files changed" }));
    const forbiddenFilesChanged = parseList(await prompter.text({ message: "Forbidden files changed" }));
    const semanticRequirements = parseList(await prompter.text({ message: "Semantic requirements" }));

    const command: BenchmarkAuthoringCommand = {
      id: identity.id,
      name: identity.name,
      category,
      repoUrl,
      fixturePath,
      commit,
      setupCommands,
      testCommands,
      promptText,
      promptFile,
      constraints,
      timeoutSeconds,
      maxCostUsd,
      requiredFilesChanged,
      forbiddenFilesChanged,
      semanticRequirements
    };

    prompter.note(reviewSummary(command), "Review");
    const confirmed = await prompter.confirm({ message: "Create this spec?", initialValue: true });
    if (!confirmed) {
      throw new PromptCancelledError();
    }

    return command;
  }

  private async tryGenerateCommands(repoUrlOrPath: string): Promise<{
    readonly setupCommands: readonly string[];
    readonly testCommands: readonly string[];
  } | undefined> {
    if (!this.options.generateCommands || !this.options.isLocalRepoPath?.(repoUrlOrPath)) {
      return undefined;
    }

    const shouldDetect = await this.options.prompter.confirm({
      message: "Detect setup and validation commands from this project?",
      initialValue: true
    });

    if (!shouldDetect) {
      return undefined;
    }

    const spinner = this.options.prompter.spinner();
    spinner.start("Detecting project commands");
    try {
      return await this.options.generateCommands(repoUrlOrPath);
    } finally {
      spinner.stop("Project commands detected");
    }
  }
}

function categoryOptions(): readonly SelectOption<BenchmarkCategory>[] {
  return BenchmarkCategorySchema.options.map((value) => ({ value }));
}

function reviewSummary(command: BenchmarkAuthoringCommand): string {
  const lines = [
    `id: ${command.id}`,
    `category: ${command.category}`,
    `source: ${command.repoUrl ?? command.fixturePath ?? "unknown"}`,
    `prompt: ${command.promptFile ?? "inline text"}`
  ];

  if ((command.setupCommands?.length ?? 0) > 0) {
    lines.push(`setup: ${command.setupCommands?.join(", ")}`);
  }

  if ((command.testCommands?.length ?? 0) > 0) {
    lines.push(`tests: ${command.testCommands?.join(", ")}`);
  }

  return lines.join("\n");
}

function requireNonEmpty(label: string): (value: string) => string | undefined {
  return (value) => (value.trim().length === 0 ? `${label} is required` : undefined);
}

function optionalPositiveNumber(label: string): (value: string) => string | undefined {
  return (value) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? undefined : `${label} must be a positive number`;
  };
}

function optionalNonnegativeNumber(label: string): (value: string) => string | undefined {
  return (value) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? undefined : `${label} must be a nonnegative number`;
  };
}

function formatList(values: readonly string[] | undefined): string | undefined {
  return values === undefined || values.length === 0 ? undefined : values.join(", ");
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseList(value: string, defaultValues: readonly string[] = []): readonly string[] {
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return parsed.length > 0 ? parsed : defaultValues;
}

function parsePositiveNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : Number(trimmed);
}

function parseNonnegativeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : Number(trimmed);
}
