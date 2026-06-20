import { describe, expect, test } from "vitest";
import { NormalizedEventSchema } from "../../src/domain/events/normalized-event.js";
import { MetricObservationSchema } from "../../src/domain/metrics/metric-observation.js";

describe("canonical event schema", () => {
  test("accepts a minimal bmh.event.v1 normalized event", () => {
    const event = NormalizedEventSchema.parse({
      schema_version: "bmh.event.v1",
      event_id: "evt_123",
      idempotency_key: "codex:run_1:turn_1:tool_1",
      provider: "codex",
      provider_event_type: "PreToolUse",
      event_type: "tool.requested",
      occurred_at: "2026-06-20T12:00:00.000Z",
      observed_at: "2026-06-20T12:00:01.000Z",
      source: {
        transport: "stdin",
        adapter_version: "codex-hooks@0.1.0"
      },
      run: {
        run_id: "run_1",
        trial_id: "trial_1"
      },
      action: {
        status: "requested"
      },
      payload: {},
      raw_ref: {
        raw_event_id: "raw_1",
        payload_hash: "sha256:abc"
      },
      quality: {
        identity: "derived",
        timestamp: "native",
        ordering: "best_effort",
        payload_completeness: "partial"
      },
      security: {
        redaction_applied: true,
        secret_scan_status: "passed"
      }
    });

    expect(event.schema_version).toBe("bmh.event.v1");
  });

  test("rejects normalized events without raw_ref", () => {
    expect(() =>
      NormalizedEventSchema.parse({
        schema_version: "bmh.event.v1",
        event_id: "evt_123",
        idempotency_key: "codex:run_1",
        provider: "codex",
        provider_event_type: "Stop",
        event_type: "turn.ended",
        occurred_at: "2026-06-20T12:00:00.000Z",
        observed_at: "2026-06-20T12:00:01.000Z",
        source: { transport: "stdin" },
        run: { run_id: "run_1" },
        action: { status: "completed" },
        payload: {},
        quality: {},
        security: {}
      })
    ).toThrow();
  });

  test("requires metric observations to declare source and confidence", () => {
    const metric = MetricObservationSchema.parse({
      metric: "input_tokens",
      value: 1000,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "provider_gateway",
      confidence: "high",
      run_id: "run_1",
      trial_id: "trial_1",
      provider: "codex",
      observed_at: "2026-06-20T12:00:00.000Z"
    });

    expect(metric.measurement_source).toBe("native");
  });
});
