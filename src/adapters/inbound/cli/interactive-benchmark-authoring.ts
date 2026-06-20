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
  readonly stdin: string;
  readonly stdout: (chunk: string) => void;
}

export class InteractiveBenchmarkAuthoring {
  private readonly answers: string[];
  private index = 0;

  public constructor(private readonly options: InteractiveBenchmarkAuthoringOptions) {
    const normalized = options.stdin.replace(/\r\n/g, "\n");
    this.answers = normalized.split("\n");

    if (this.answers.at(-1) === "") {
      this.answers.pop();
    }
  }

  public collect(): BenchmarkAuthoringCommand {
    const id = this.required("Benchmark id");
    const name = this.required("Name");
    const category = this.required("Category");
    const source = this.required("Source (repo or fixture)").toLowerCase();

    let repoUrl: string | undefined;
    let fixturePath: string | undefined;
    let commit: string | undefined;
    let setupCommands: readonly string[];
    let testCommands: readonly string[];

    if (source === "repo") {
      repoUrl = this.required("Repo URL");
      commit = optional(this.ask("Commit"));
      setupCommands = parseList(this.ask("Setup commands"));
      testCommands = parseList(this.ask("Test commands"));
    } else if (source === "fixture") {
      fixturePath = this.required("Fixture path");
      setupCommands = parseList(this.ask("Setup commands"));
      testCommands = parseList(this.ask("Test commands"));
    } else {
      throw new Error("source must be repo or fixture");
    }

    const promptSource = this.required("Prompt source (text or file)").toLowerCase();
    let promptText: string | undefined;
    let promptFile: string | undefined;

    if (promptSource === "text") {
      promptText = this.required("Prompt text");
    } else if (promptSource === "file") {
      promptFile = this.required("Prompt Markdown file");
    } else {
      throw new Error("prompt source must be text or file");
    }

    const constraints = parseList(this.ask("Constraints"));
    const timeoutSeconds = parseOptionalPositiveNumber(this.ask("Timeout seconds"), "timeout seconds");
    const maxCostUsd = parseOptionalNonnegativeNumber(this.ask("Max cost USD"), "max cost USD");
    const requiredFilesChanged = parseList(this.ask("Required files changed"));
    const forbiddenFilesChanged = parseList(this.ask("Forbidden files changed"));
    const semanticRequirements = parseList(this.ask("Semantic requirements"));

    return {
      id,
      name,
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

  private required(label: string): string {
    const value = optional(this.ask(label));

    if (value === undefined) {
      throw new Error(`${label} is required`);
    }

    return value;
  }

  private ask(label: string): string {
    this.options.stdout(`${label}: `);

    if (this.index >= this.answers.length) {
      throw new Error("interactive input ended before all answers were provided");
    }

    const answer = this.answers[this.index];
    this.index += 1;
    return answer;
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
