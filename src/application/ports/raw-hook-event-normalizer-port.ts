import type { AppendNormalizedEventInput } from "./normalized-event-store.js";
import type { RawHookEvent } from "./raw-event-store.js";

export interface RawHookEventNormalizerPort {
  normalize(raw: RawHookEvent): AppendNormalizedEventInput;
}
