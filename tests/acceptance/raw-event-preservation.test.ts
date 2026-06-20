import { describe, expect, test } from "vitest";
import { InMemoryRawEventStore } from "../../src/adapters/outbound/storage/in-memory-raw-event-store.js";
import { normalizeRawHookEvent } from "../../src/application/use-cases/normalize-raw-hook-event.js";
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };

describe("raw event preservation", () => {
  test("stores raw hook events before normalization", async () => {
    const store = new InMemoryRawEventStore();

    const raw = await store.append({
      provider: "codex",
      run_id: "run_1",
      trial_id: "trial_1",
      payload: codexPreToolUse
    });

    expect(raw.raw_event_id).toMatch(/^raw_/);
    expect(raw.payload_hash).toMatch(/^sha256:/);
  });

  test("normalized events reference the raw event", async () => {
    const store = new InMemoryRawEventStore();
    const raw = await store.append({
      provider: "codex",
      run_id: "run_1",
      trial_id: "trial_1",
      payload: codexPreToolUse
    });

    const normalized = normalizeRawHookEvent(raw);

    expect(normalized.raw_ref.raw_event_id).toBe(raw.raw_event_id);
    expect(normalized.raw_ref.payload_hash).toBe(raw.payload_hash);
  });

  test("duplicates increment duplicate count instead of creating new raw events", async () => {
    const store = new InMemoryRawEventStore();
    await store.append({ provider: "codex", run_id: "run_1", trial_id: "trial_1", payload: codexPreToolUse });
    const duplicate = await store.append({ provider: "codex", run_id: "run_1", trial_id: "trial_1", payload: codexPreToolUse });

    expect(duplicate.duplicate_count).toBe(1);
    expect(await store.count()).toBe(1);
  });
});
