import type { AppendRawHookEventInput, RawEventStore, RawHookEvent } from "../ports/raw-event-store.js";

export async function ingestRawHookEvent(store: RawEventStore, input: AppendRawHookEventInput): Promise<RawHookEvent> {
  return store.append(input);
}
