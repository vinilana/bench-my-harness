import { describe, expect, test } from "vitest";

import { InMemoryNormalizedEventStore } from "../../src/adapters/outbound/storage/in-memory-normalized-event-store.js";
import { InMemoryRawEventStore } from "../../src/adapters/outbound/storage/in-memory-raw-event-store.js";
import { reprocessRawEvents } from "../../src/application/use-cases/reprocess-raw-events.js";
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };
import codexStop from "../fixtures/codex/stop.json" with { type: "json" };

describe("raw event reprocessing", () => {
  test("normalizes raw events into the normalized event store with raw references", async () => {
    const rawStore = new InMemoryRawEventStore();
    const normalizedStore = new InMemoryNormalizedEventStore();
    const firstRaw = await rawStore.append({ provider: "codex", run_id: "run_1", trial_id: "trial_1", payload: codexPreToolUse });
    await rawStore.append({ provider: "codex", run_id: "run_1", trial_id: "trial_1", payload: codexStop });

    const result = await reprocessRawEvents({ rawStore, normalizedStore }, { provider: "codex", run_id: "run_1" });

    expect(result.processed).toBe(2);
    expect(result.stored).toHaveLength(2);
    expect(result.stored[0]?.raw_ref.raw_event_id).toBe(firstRaw.raw_event_id);
    await expect(normalizedStore.count()).resolves.toBe(2);
  });

  test("is idempotent when reprocessing the same raw events again", async () => {
    const rawStore = new InMemoryRawEventStore();
    const normalizedStore = new InMemoryNormalizedEventStore();
    await rawStore.append({ provider: "codex", run_id: "run_1", trial_id: "trial_1", payload: codexPreToolUse });

    await reprocessRawEvents({ rawStore, normalizedStore }, { provider: "codex", run_id: "run_1" });
    const second = await reprocessRawEvents({ rawStore, normalizedStore }, { provider: "codex", run_id: "run_1" });

    expect(second.processed).toBe(1);
    expect(second.stored).toHaveLength(1);
    await expect(normalizedStore.count()).resolves.toBe(1);
  });
});
