import type {
  AppendNormalizedEventInput,
  NormalizedEventListFilter,
  NormalizedEventStore,
  NormalizedStoredEvent
} from "../../../application/ports/normalized-event-store.js";
import type { JsonValue } from "../../../application/ports/raw-event-store.js";

export class InMemoryNormalizedEventStore implements NormalizedEventStore {
  private readonly recordsById = new Map<string, NormalizedStoredEvent>();
  private readonly idsByIdempotencyKey = new Map<string, string>();

  async append(input: AppendNormalizedEventInput): Promise<NormalizedStoredEvent> {
    const idempotencyIndexKey = toIdempotencyIndexKey(input.provider, input.idempotency_key);
    const existingId = this.idsByIdempotencyKey.get(idempotencyIndexKey);

    if (existingId !== undefined) {
      const existing = this.recordsById.get(existingId);

      if (existing === undefined) {
        throw new Error(`Normalized event index referenced missing event ${existingId}`);
      }

      return cloneNormalizedEvent(existing);
    }

    if (this.recordsById.has(input.event_id)) {
      throw new Error(`Normalized event ${input.event_id} already exists with a different idempotency key`);
    }

    const stored = cloneNormalizedEvent(input);
    this.recordsById.set(stored.event_id, stored);
    this.idsByIdempotencyKey.set(idempotencyIndexKey, stored.event_id);

    return cloneNormalizedEvent(stored);
  }

  async count(): Promise<number> {
    return this.recordsById.size;
  }

  async findById(eventId: string): Promise<NormalizedStoredEvent | undefined> {
    const normalized = this.recordsById.get(eventId);
    return normalized === undefined ? undefined : cloneNormalizedEvent(normalized);
  }

  async findByIdempotencyKey(provider: NormalizedStoredEvent["provider"], idempotencyKey: string): Promise<NormalizedStoredEvent | undefined> {
    const eventId = this.idsByIdempotencyKey.get(toIdempotencyIndexKey(provider, idempotencyKey));

    if (eventId === undefined) {
      return undefined;
    }

    return this.findById(eventId);
  }

  async list(filter: NormalizedEventListFilter = {}): Promise<NormalizedStoredEvent[]> {
    return Array.from(this.recordsById.values())
      .filter((normalized) => matchesNormalizedFilter(normalized, filter))
      .map((normalized) => cloneNormalizedEvent(normalized));
  }
}

function toIdempotencyIndexKey(provider: NormalizedStoredEvent["provider"], idempotencyKey: string): string {
  return `${provider}:${idempotencyKey}`;
}

function cloneNormalizedEvent<T extends NormalizedStoredEvent>(event: T): T {
  return cloneJson(event);
}

function cloneJson<T extends JsonValue | NormalizedStoredEvent>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function matchesNormalizedFilter(normalized: NormalizedStoredEvent, filter: NormalizedEventListFilter): boolean {
  return (
    (filter.provider === undefined || normalized.provider === filter.provider) &&
    (filter.run_id === undefined || normalized.run.run_id === filter.run_id) &&
    (filter.trial_id === undefined || normalized.run.trial_id === filter.trial_id) &&
    (filter.raw_event_id === undefined || normalized.raw_ref.raw_event_id === filter.raw_event_id)
  );
}
