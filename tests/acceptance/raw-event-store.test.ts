import { describe, expect, test } from "vitest";

import { InMemoryRawEventStore } from "../../src/adapters/outbound/storage/in-memory-raw-event-store.js";
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };
import claudePreToolUse from "../fixtures/claude-code/pre-tool-use.json" with { type: "json" };

describe("raw event store", () => {
  test("lists raw events for reprocessing in insertion order", async () => {
    const store = new InMemoryRawEventStore();
    const first = await store.append({ provider: "codex", run_id: "run_1", trial_id: "trial_1", payload: codexPreToolUse });
    const second = await store.append({
      provider: "claude_code",
      run_id: "run_2",
      trial_id: "trial_2",
      payload: claudePreToolUse
    });

    await expect(store.list()).resolves.toEqual([first, second]);
    await expect(store.findById(first.raw_event_id)).resolves.toEqual(first);
  });

  test("filters raw events by provider, run, and trial", async () => {
    const store = new InMemoryRawEventStore();
    const matching = await store.append({ provider: "codex", run_id: "run_1", trial_id: "trial_1", payload: codexPreToolUse });
    await store.append({ provider: "codex", run_id: "run_1", trial_id: "trial_2", payload: codexPreToolUse });
    await store.append({ provider: "claude_code", run_id: "run_1", trial_id: "trial_1", payload: claudePreToolUse });

    await expect(store.list({ provider: "codex", run_id: "run_1", trial_id: "trial_1" })).resolves.toEqual([matching]);
  });
});
