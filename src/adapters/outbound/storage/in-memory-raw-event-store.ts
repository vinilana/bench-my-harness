import { createHash } from "node:crypto";

import type { AppendRawHookEventInput, JsonValue, RawEventStore, RawHookEvent } from "../../../application/ports/raw-event-store.js";

export class InMemoryRawEventStore implements RawEventStore {
  private readonly recordsById = new Map<string, RawHookEvent>();
  private readonly idsByFingerprint = new Map<string, string>();
  private nextId = 1;

  async append(input: AppendRawHookEventInput): Promise<RawHookEvent> {
    const payloadHash = hashPayload(input.payload);
    const fingerprint = [input.provider, input.run_id, input.trial_id, payloadHash].join(":");
    const existingId = this.idsByFingerprint.get(fingerprint);

    if (existingId !== undefined) {
      const existing = this.recordsById.get(existingId);

      if (existing === undefined) {
        throw new Error(`Raw event index referenced missing event ${existingId}`);
      }

      existing.duplicate_count += 1;
      return cloneRawHookEvent(existing);
    }

    const raw: RawHookEvent = {
      raw_event_id: `raw_${this.nextId++}`,
      provider: input.provider,
      run_id: input.run_id,
      trial_id: input.trial_id,
      payload: cloneJson(input.payload),
      payload_hash: payloadHash,
      observed_at: input.observed_at ?? new Date().toISOString(),
      duplicate_count: 0
    };

    this.recordsById.set(raw.raw_event_id, raw);
    this.idsByFingerprint.set(fingerprint, raw.raw_event_id);

    return cloneRawHookEvent(raw);
  }

  async count(): Promise<number> {
    return this.recordsById.size;
  }

  async findById(rawEventId: string): Promise<RawHookEvent | undefined> {
    const raw = this.recordsById.get(rawEventId);
    return raw === undefined ? undefined : cloneRawHookEvent(raw);
  }
}

export function hashPayload(payload: JsonValue): string {
  return `sha256:${createHash("sha256").update(stableStringify(payload)).digest("hex")}`;
}

function stableStringify(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function cloneRawHookEvent(raw: RawHookEvent): RawHookEvent {
  return {
    ...raw,
    payload: cloneJson(raw.payload)
  };
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
