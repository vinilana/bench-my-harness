import {
  PromptCancelledError,
  matchOption,
  optionLabel,
  type ConfirmPromptOptions,
  type MultiselectPromptOptions,
  type Prompter,
  type SelectPromptOptions,
  type Spinner,
  type TextPromptOptions
} from "./prompter.js";

export interface ScriptedPrompterOptions {
  /** Ordered answers, one consumed per prompt (in the order prompts are issued). */
  readonly answers: readonly string[];
  /** Echoes prompt text so tests can observe what a user would see. */
  readonly stdout: (chunk: string) => void;
  /**
   * Zero-based prompt index at which to simulate a cancel (Ctrl+C / Esc). The prompt at
   * this index throws PromptCancelledError instead of returning.
   */
  readonly cancelAt?: number;
}

/**
 * Deterministic Prompter for tests and non-TTY contexts. It renders the same text a user
 * would see (so acceptance tests can assert on prompts) and consumes a pre-supplied answer
 * list. It never touches a real terminal and never imports a prompt engine.
 */
export class ScriptedPrompter implements Prompter {
  private readonly answers: readonly string[];
  private index = 0;

  public constructor(private readonly options: ScriptedPrompterOptions) {
    const answers = [...options.answers];
    // Drop a single trailing empty answer produced by a trailing newline in piped input.
    if (answers.at(-1) === "") {
      answers.pop();
    }

    this.answers = answers;
  }

  public intro(title: string): void {
    this.options.stdout(`${title}\n`);
  }

  public outro(message: string): void {
    this.options.stdout(`${message}\n`);
  }

  public note(body: string, title?: string): void {
    this.options.stdout(`${title === undefined ? "" : `${title}\n`}${body}\n`);
  }

  public async text(options: TextPromptOptions): Promise<string> {
    for (;;) {
      this.options.stdout(promptLabel(options.message, options.defaultValue));
      const raw = this.take();
      const exhausted = raw === undefined;
      const value = raw === undefined || raw.trim().length === 0 ? options.defaultValue ?? "" : raw.trim();

      const error = options.validate?.(value);
      if (error === undefined) {
        return value;
      }

      // Exhausted scripted input cannot satisfy validation — fail loudly instead of looping.
      if (exhausted) {
        throw new Error(`${options.message}: ${error}`);
      }

      this.options.stdout(`${error}\n`);
    }
  }

  public async select<T extends string>(options: SelectPromptOptions<T>): Promise<T> {
    const rendered = options.options.map(optionLabel).join("|");
    for (;;) {
      this.options.stdout(
        `${options.message} (${rendered})${options.initialValue === undefined ? "" : ` [${options.initialValue}]`}: `
      );
      const raw = this.take();
      if (raw === undefined || raw.trim().length === 0) {
        if (options.initialValue !== undefined) {
          return options.initialValue;
        }

        if (raw === undefined) {
          throw new Error(`${options.message} requires a selection`);
        }
      } else {
        const match = matchOption(options.options, raw);
        if (match !== undefined) {
          return match;
        }
      }

      this.options.stdout(`${options.message} must be one of: ${options.options.map(optionLabel).join(", ")}\n`);
    }
  }

  public async multiselect<T extends string>(options: MultiselectPromptOptions<T>): Promise<readonly T[]> {
    this.options.stdout(
      `${options.message} (${options.options.map(optionLabel).join(", ")})${
        options.initialValues === undefined ? "" : ` [${options.initialValues.join(", ")}]`
      }: `
    );
    const raw = this.take();
    if (raw === undefined || raw.trim().length === 0) {
      return options.initialValues ?? [];
    }

    const selected = raw
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => matchOption(options.options, entry))
      .filter((value): value is T => value !== undefined);

    return selected;
  }

  public async confirm(options: ConfirmPromptOptions): Promise<boolean> {
    const initial = options.initialValue ?? true;
    // Render before consuming so the prompt is visible even when the script is exhausted,
    // matching the "renders the same text a user would see" contract of the other methods.
    this.options.stdout(`${options.message} (${initial ? "Y/n" : "y/N"}): `);
    const raw = this.take();
    // Exhausted scripts accept the default silently — review confirmations at the end of a
    // flow do not require an explicit answer.
    if (raw === undefined) {
      return initial;
    }

    const normalized = raw.trim().toLowerCase();
    if (normalized.length === 0) {
      return initial;
    }

    return ["y", "yes", "true", "1"].includes(normalized);
  }

  public spinner(): Spinner {
    return { start: () => {}, stop: () => {} };
  }

  private take(): string | undefined {
    if (this.options.cancelAt === this.index) {
      this.index += 1;
      throw new PromptCancelledError();
    }

    if (this.index >= this.answers.length) {
      this.index += 1;
      return undefined;
    }

    const answer = this.answers[this.index];
    this.index += 1;
    return answer;
  }
}

function promptLabel(message: string, defaultValue?: string): string {
  return defaultValue === undefined || defaultValue.length === 0
    ? `${message}: `
    : `${message} [${defaultValue}]: `;
}
