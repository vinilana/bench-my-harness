import type { NormalizedEventStore, NormalizedStoredEvent } from "../ports/normalized-event-store.js";
import type { RawEventListFilter, RawEventStore } from "../ports/raw-event-store.js";
import { normalizeRawHookEvent } from "./normalize-raw-hook-event.js";

export interface ReprocessRawEventsStores {
  rawStore: RawEventStore;
  normalizedStore: NormalizedEventStore;
}

export interface ReprocessRawEventsResult {
  processed: number;
  stored: NormalizedStoredEvent[];
}

export async function reprocessRawEvents(stores: ReprocessRawEventsStores, filter: RawEventListFilter = {}): Promise<ReprocessRawEventsResult> {
  const rawEvents = await stores.rawStore.list(filter);
  const stored: NormalizedStoredEvent[] = [];

  for (const raw of rawEvents) {
    stored.push(await stores.normalizedStore.append(normalizeRawHookEvent(raw)));
  }

  return {
    processed: rawEvents.length,
    stored
  };
}
