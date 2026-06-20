import { describe, expect, test } from "vitest";

import { InMemoryRawEventStore } from "../../src/adapters/outbound/storage/in-memory-raw-event-store.js";
import { ingestFileEvents } from "../../src/application/use-cases/ingest-file-events.js";
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };
import codexStop from "../fixtures/codex/stop.json" with { type: "json" };

describe("file import", () => {
  test("imports JSONL events into the raw event store", async () => {
    const store = new InMemoryRawEventStore();
    const contents = `${JSON.stringify(codexPreToolUse)}\n${JSON.stringify(codexStop)}\n`;

    const result = await ingestFileEvents(store, {
      provider: "codex",
      run_id: "run_1",
      trial_id: "trial_1",
      contents,
      format: "jsonl",
      best_effort: false
    });

    expect(result.imported).toHaveLength(2);
    expect(result.errors).toEqual([]);
    await expect(store.count()).resolves.toBe(2);
  });

  test("imports JSON array events into the raw event store", async () => {
    const store = new InMemoryRawEventStore();

    const result = await ingestFileEvents(store, {
      provider: "codex",
      run_id: "run_1",
      trial_id: "trial_1",
      contents: JSON.stringify([codexPreToolUse, codexStop]),
      format: "json",
      best_effort: false
    });

    expect(result.imported).toHaveLength(2);
    expect(result.errors).toEqual([]);
    await expect(store.count()).resolves.toBe(2);
  });

  test("reports invalid JSONL line numbers while preserving good lines in best-effort mode", async () => {
    const store = new InMemoryRawEventStore();
    const contents = [
      JSON.stringify(codexPreToolUse),
      "{not-json",
      "",
      JSON.stringify(codexStop)
    ].join("\n");

    const result = await ingestFileEvents(store, {
      provider: "codex",
      run_id: "run_1",
      trial_id: "trial_1",
      contents,
      format: "jsonl",
      best_effort: true
    });

    expect(result.imported).toHaveLength(2);
    expect(result.errors).toEqual([
      expect.objectContaining({
        line: 2,
        message: expect.stringContaining("Invalid JSON")
      })
    ]);
    await expect(store.count()).resolves.toBe(2);
  });
});
