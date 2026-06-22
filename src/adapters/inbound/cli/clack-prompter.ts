import {
  confirm as clackConfirm,
  intro as clackIntro,
  isCancel,
  multiselect as clackMultiselect,
  note as clackNote,
  outro as clackOutro,
  select as clackSelect,
  spinner as clackSpinner,
  text as clackText,
  type Option
} from "@clack/prompts";
import {
  PromptCancelledError,
  optionLabel,
  type ConfirmPromptOptions,
  type MultiselectPromptOptions,
  type Prompter,
  type SelectOption,
  type SelectPromptOptions,
  type Spinner,
  type TextPromptOptions
} from "./prompter.js";

/**
 * Production Prompter backed by @clack/prompts. This is the ONLY module allowed to import
 * the prompt engine; everything else depends on the Prompter port. It renders to the real
 * terminal, so it must only be constructed on an interactive TTY and is never used in tests.
 */
export class ClackPrompter implements Prompter {
  public intro(title: string): void {
    clackIntro(title);
  }

  public outro(message: string): void {
    clackOutro(message);
  }

  public note(body: string, title?: string): void {
    clackNote(body, title);
  }

  public async text(options: TextPromptOptions): Promise<string> {
    const result = await clackText({
      message: options.message,
      placeholder: options.placeholder ?? options.defaultValue,
      defaultValue: options.defaultValue,
      validate: options.validate
        ? (value) => {
            const error = options.validate?.(value ?? "");
            return error === undefined ? undefined : error;
          }
        : undefined
    });

    return unwrap(result, (value) => (typeof value === "string" && value.length > 0 ? value : options.defaultValue ?? ""));
  }

  public async select<T extends string>(options: SelectPromptOptions<T>): Promise<T> {
    const result = await clackSelect({
      message: options.message,
      options: options.options.map((option) => toClackOption(option)),
      initialValue: options.initialValue
    });

    return unwrap(result, (value) => value as T);
  }

  public async multiselect<T extends string>(options: MultiselectPromptOptions<T>): Promise<readonly T[]> {
    const result = await clackMultiselect({
      message: options.message,
      options: options.options.map((option) => toClackOption(option)),
      initialValues: options.initialValues === undefined ? undefined : [...options.initialValues],
      required: options.required ?? false
    });

    return unwrap(result, (value) => value as readonly T[]);
  }

  public async confirm(options: ConfirmPromptOptions): Promise<boolean> {
    const result = await clackConfirm({
      message: options.message,
      initialValue: options.initialValue ?? true
    });

    return unwrap(result, (value) => value === true);
  }

  public spinner(): Spinner {
    const instance = clackSpinner();
    return {
      start: (message) => instance.start(message),
      stop: (message) => instance.stop(message)
    };
  }
}

function toClackOption<T extends string>(option: SelectOption<T>): Option<T> {
  const mapped = option.hint === undefined
    ? { value: option.value, label: optionLabel(option) }
    : { value: option.value, label: optionLabel(option), hint: option.hint };

  return mapped as unknown as Option<T>;
}

function unwrap<R, V>(result: V | symbol, map: (value: V) => R): R {
  if (isCancel(result)) {
    throw new PromptCancelledError();
  }

  return map(result as V);
}
