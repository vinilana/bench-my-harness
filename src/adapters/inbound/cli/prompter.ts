// Prompter port: the seam between interactive CLI flows and the concrete prompt
// engine. Authoring/menu logic depends only on this interface, never on a TTY or a
// specific prompt library, so the same flow drives a rich terminal UI (ClackPrompter)
// and deterministic tests (ScriptedPrompter).

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label?: string;
  readonly hint?: string;
}

export interface TextPromptOptions {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly validate?: (value: string) => string | undefined;
}

export interface SelectPromptOptions<T extends string> {
  readonly message: string;
  readonly options: readonly SelectOption<T>[];
  readonly initialValue?: T;
}

export interface MultiselectPromptOptions<T extends string> {
  readonly message: string;
  readonly options: readonly SelectOption<T>[];
  readonly initialValues?: readonly T[];
  readonly required?: boolean;
}

export interface ConfirmPromptOptions {
  readonly message: string;
  readonly initialValue?: boolean;
}

export interface Spinner {
  start(message: string): void;
  stop(message: string): void;
}

export interface Prompter {
  intro(title: string): void;
  outro(message: string): void;
  note(body: string, title?: string): void;
  text(options: TextPromptOptions): Promise<string>;
  select<T extends string>(options: SelectPromptOptions<T>): Promise<T>;
  multiselect<T extends string>(options: MultiselectPromptOptions<T>): Promise<readonly T[]>;
  confirm(options: ConfirmPromptOptions): Promise<boolean>;
  spinner(): Spinner;
}

/**
 * Thrown when a prompt is cancelled (Ctrl+C / Esc on a TTY, or an explicit cancel in a
 * script). Callers treat this as a clean abort: write nothing and exit non-zero.
 */
export class PromptCancelledError extends Error {
  public constructor(message = "cancelled") {
    super(message);
    this.name = "PromptCancelledError";
  }
}

export function optionLabel<T extends string>(option: SelectOption<T>): string {
  return option.label ?? option.value;
}

/**
 * Resolve a free-typed answer against a closed option set, matching case-insensitively on
 * either the option value or its label. Returns undefined when nothing matches.
 */
export function matchOption<T extends string>(
  options: readonly SelectOption<T>[],
  answer: string
): T | undefined {
  const normalized = answer.trim().toLowerCase();
  const match = options.find(
    (option) =>
      option.value.toLowerCase() === normalized || optionLabel(option).toLowerCase() === normalized
  );

  return match?.value;
}
