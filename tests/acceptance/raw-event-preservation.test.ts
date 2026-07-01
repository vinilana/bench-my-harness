import { describe, expect, test } from "vitest";
import { InMemoryRawEventStore } from "../../src/adapters/outbound/storage/in-memory-raw-event-store.js";
import { normalizeRawHookEvent } from "../../src/adapters/outbound/harnesses/provider-raw-hook-event-normalizer.js";
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

  test("records raw payload retention and redaction metadata", async () => {
    const store = new InMemoryRawEventStore();

    const raw = await store.append({
      provider: "codex",
      run_id: "run_1",
      trial_id: "trial_1",
      payload: codexPreToolUse,
      security: {
        redaction_applied: true,
        secret_scan_status: "passed",
        original_payload_hash: "sha256:original",
        redaction_hashes: ["sha256:redacted-secret"]
      }
    });

    expect(raw.security).toEqual({
      redaction_applied: true,
      secret_scan_status: "passed",
      raw_payload_retention: "stored",
      raw_payloads_included: true,
      original_payload_hash: "sha256:original",
      redaction_hashes: ["sha256:redacted-secret"]
    });
  });

  test("defaults raw event security metadata when no scanner result is supplied", async () => {
    const store = new InMemoryRawEventStore();

    const raw = await store.append({
      provider: "codex",
      run_id: "run_1",
      trial_id: "trial_1",
      payload: codexPreToolUse
    });

    expect(raw.security).toEqual({
      redaction_applied: false,
      secret_scan_status: "pending",
      raw_payload_retention: "stored",
      raw_payloads_included: true
    });
  });

  test("normalized events preserve raw event security evidence", async () => {
    const store = new InMemoryRawEventStore();
    const raw = await store.append({
      provider: "codex",
      run_id: "run_1",
      trial_id: "trial_1",
      payload: codexPreToolUse,
      security: {
        redaction_applied: true,
        secret_scan_status: "passed",
        redaction_hashes: ["sha256:redacted-secret"]
      }
    });

    const normalized = normalizeRawHookEvent(raw);

    expect(normalized.security).toEqual({
      redaction_applied: true,
      secret_scan_status: "passed",
      redaction_hashes: ["sha256:redacted-secret"]
    });
  });
});
