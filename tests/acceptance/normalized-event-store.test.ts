import { describe, expect, test } from "vitest";

import { InMemoryNormalizedEventStore } from "../../src/adapters/outbound/storage/in-memory-normalized-event-store.js";
import { InMemoryRawEventStore } from "../../src/adapters/outbound/storage/in-memory-raw-event-store.js";
import { normalizeRawHookEvent } from "../../src/application/use-cases/normalize-raw-hook-event.js";
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };

describe("normalized event store", () => {
  test("enforces idempotency key uniqueness per provider", async () => {
    const rawStore = new InMemoryRawEventStore();
    const normalizedStore = new InMemoryNormalizedEventStore();
    const raw = await rawStore.append({ provider: "codex", run_id: "run_1", trial_id: "trial_1", payload: codexPreToolUse });
    const normalized = normalizeRawHookEvent(raw);

    const first = await normalizedStore.append(normalized);
    const second = await normalizedStore.append({
      ...normalized,
      event_id: "evt_conflicting_duplicate"
    });

    expect(second).toEqual(first);
    await expect(normalizedStore.count()).resolves.toBe(1);
    await expect(normalizedStore.findByIdempotencyKey("codex", normalized.idempotency_key)).resolves.toEqual(first);
  });
});
