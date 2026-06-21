import { generateDefaultSpecIdentity } from "../../../domain/benchmark/spec-catalog.js";

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
  readonly stdin?: string;
  readonly stdout?: (chunk: string) => void;
  readonly question?: (label: string) => string | Promise<string>;
  readonly generateCommands?: (repoUrlOrPath: string) => Promise<{
    readonly setupCommands: readonly string[];
    readonly testCommands: readonly string[];
  }>;
  readonly isLocalRepoPath?: (value: string) => boolean;
}

export class InteractiveBenchmarkAuthoring {
  private readonly answers: string[];
  private index = 0;

  public constructor(private readonly options: InteractiveBenchmarkAuthoringOptions) {
    const normalized = (options.stdin ?? "").replace(/\r\n/g, "\n");
    this.answers = normalized.split("\n");

    if (this.answers.at(-1) === "") {
      this.answers.pop();
    }
  }

  public async collect(): Promise<BenchmarkAuthoringCommand> {
    const identity = generateDefaultSpecIdentity();
    const category = await this.required("Category");
    const source = (await this.required("Source (repo or fixture)")).toLowerCase();

    let repoUrl: string | undefined;
    let fixturePath: string | undefined;
    let commit: string | undefined;
    let setupCommands: readonly string[];
    let testCommands: readonly string[];

    if (source === "repo") {
      repoUrl = await this.required("Repo URL or path");
      commit = optional(await this.ask("Commit"));
      const generatedCommands = await this.tryGenerateCommands(repoUrl);
      setupCommands = generatedCommands?.setupCommands ?? parseList(await this.ask("Setup commands"));
      testCommands = generatedCommands?.testCommands ?? parseList(await this.ask("Test commands"));
    } else if (source === "fixture") {
      fixturePath = await this.required("Fixture path");
      setupCommands = parseList(await this.ask("Setup commands"));
      testCommands = parseList(await this.ask("Test commands"));
    } else {
      throw new Error("source must be repo or fixture");
    }

    const promptSource = (await this.required("Prompt source (text or file)")).toLowerCase();
    let promptText: string | undefined;
    let promptFile: string | undefined;

    if (promptSource === "text") {
      promptText = await this.required("Prompt text");
    } else if (promptSource === "file") {
      promptFile = await this.required("Prompt Markdown file");
    } else {
      throw new Error("prompt source must be text or file");
    }

    const constraints = parseList(await this.ask("Constraints"));
    const timeoutSeconds = parseOptionalPositiveNumber(await this.ask("Timeout seconds"), "timeout seconds");
    const maxCostUsd = parseOptionalNonnegativeNumber(await this.ask("Max cost USD"), "max cost USD");
    const requiredFilesChanged = parseList(await this.ask("Required files changed"));
    const forbiddenFilesChanged = parseList(await this.ask("Forbidden files changed"));
    const semanticRequirements = parseList(await this.ask("Semantic requirements"));

    return {
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
  }

  private async required(label: string): Promise<string> {
    const value = optional(await this.ask(label));

    if (value === undefined) {
      throw new Error(`${label} is required`);
    }

    return value;
  }

  private async ask(label: string): Promise<string> {
    if (this.options.question) {
      return this.options.question(label);
    }

    this.options.stdout?.(`${label}: `);

    if (this.index >= this.answers.length) {
      throw new Error("interactive input ended before all answers were provided");
    }

    const answer = this.answers[this.index];
    this.index += 1;
    return answer;
  }

  private async tryGenerateCommands(repoUrlOrPath: string): Promise<{
    readonly setupCommands: readonly string[];
    readonly testCommands: readonly string[];
  } | undefined> {
    if (!this.options.generateCommands || !this.options.isLocalRepoPath?.(repoUrlOrPath)) {
      return undefined;
    }

    const answer = optional(await this.ask("Detect setup and validation commands from this project? (Y/n)"));

    if (answer === undefined || answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      return this.options.generateCommands(repoUrlOrPath);
    }

    if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
      return undefined;
    }

    throw new Error("detect setup and validation commands answer must be y or n");
  }
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseList(value: string): readonly string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseOptionalPositiveNumber(value: string, label: string): number | undefined {
  const trimmed = optional(value);

  if (trimmed === undefined) {
    return undefined;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }

  return parsed;
}

function parseOptionalNonnegativeNumber(value: string, label: string): number | undefined {
  const trimmed = optional(value);

  if (trimmed === undefined) {
    return undefined;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a nonnegative number`);
  }

  return parsed;
}
