import type { AppendRawHookEventInput, RawHookEvent } from "./raw-event-store.js";

export interface RawEventIngestPort {
  ingest(input: AppendRawHookEventInput): Promise<RawHookEvent | void>;
}
