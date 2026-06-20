import type { AppendRawHookEventInput, JsonValue, RawEventStore } from "../ports/raw-event-store.js";

export type FileImportFormat = "json" | "jsonl";

export interface IngestFileEventsInput extends Omit<AppendRawHookEventInput, "payload"> {
  contents: string;
  format: FileImportFormat;
  best_effort?: boolean;
}

export interface FileImportError {
  line?: number;
  message: string;
}

export interface IngestFileEventsResult {
  imported: Awaited<ReturnType<RawEventStore["append"]>>[];
  errors: FileImportError[];
}

export async function ingestFileEvents(store: RawEventStore, input: IngestFileEventsInput): Promise<IngestFileEventsResult> {
  const result: IngestFileEventsResult = {
    imported: [],
    errors: []
  };

  if (input.format === "jsonl") {
    await ingestJsonLines(store, input, result);
    return result;
  }

  await ingestJson(store, input, result);
  return result;
}

async function ingestJsonLines(store: RawEventStore, input: IngestFileEventsInput, result: IngestFileEventsResult): Promise<void> {
  const lines = input.contents.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      continue;
    }

    const payload = parseJsonValue(trimmed, lineNumber);

    if (!payload.ok) {
      handleImportError(payload.error, input, result);
      continue;
    }

    result.imported.push(await appendPayload(store, input, payload.value));
  }
}

async function ingestJson(store: RawEventStore, input: IngestFileEventsInput, result: IngestFileEventsResult): Promise<void> {
  const payload = parseJsonValue(input.contents);

  if (!payload.ok) {
    handleImportError(payload.error, input, result);
    return;
  }

  const payloads = Array.isArray(payload.value) ? payload.value : [payload.value];

  for (const item of payloads) {
    result.imported.push(await appendPayload(store, input, item));
  }
}

async function appendPayload(store: RawEventStore, input: IngestFileEventsInput, payload: JsonValue): Promise<IngestFileEventsResult["imported"][number]> {
  return store.append({
    provider: input.provider,
    run_id: input.run_id,
    trial_id: input.trial_id,
    observed_at: input.observed_at,
    payload
  });
}

function parseJsonValue(contents: string, line?: number): { ok: true; value: JsonValue } | { ok: false; error: FileImportError } {
  try {
    const value = JSON.parse(contents) as unknown;

    if (!isJsonValue(value)) {
      return {
        ok: false,
        error: {
          line,
          message: "Invalid JSON value"
        }
      };
    }

    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: {
        line,
        message: `Invalid JSON${error instanceof Error ? `: ${error.message}` : ""}`
      }
    };
  }
}

function handleImportError(error: FileImportError, input: IngestFileEventsInput, result: IngestFileEventsResult): void {
  if (input.best_effort === true) {
    result.errors.push(error);
    return;
  }

  throw new Error(error.line === undefined ? error.message : `${error.message} on line ${error.line}`);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (typeof value === "object") {
    return Object.values(value).every((item) => isJsonValue(item));
  }

  return false;
}
