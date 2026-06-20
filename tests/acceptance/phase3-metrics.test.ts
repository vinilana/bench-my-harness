import { describe, expect, test } from "vitest";
import { computeMetrics } from "../../src/application/use-cases/compute-metrics.js";
import type { NormalizedEvent } from "../../src/domain/events/normalized-event.js";

const baseEvent = {
  schema_version: "bmh.event.v1",
  idempotency_key: "codex:run_1",
  provider: "codex",
  provider_event_type: "PostToolUse",
  occurred_at: "2026-06-20T12:00:00.000Z",
  observed_at: "2026-06-20T12:00:01.000Z",
  source: { transport: "stdin", adapter_version: "codex-hooks@0.1.0" },
  run: { run_id: "run_1", trial_id: "trial_1" },
  action: { name: "Bash", category: "tool", status: "completed" },
  payload: {},
  raw_ref: { raw_event_id: "raw_1", payload_hash: "sha256:raw" },
  quality: {
    identity: "derived",
    timestamp: "native",
    ordering: "best_effort",
    payload_completeness: "partial"
  },
  security: { redaction_applied: true, secret_scan_status: "passed" }
} satisfies Omit<NormalizedEvent, "event_id" | "event_type">;

function event(event_id: string, event_type: NormalizedEvent["event_type"], action = baseEvent.action): NormalizedEvent {
  return {
    ...baseEvent,
    event_id,
    idempotency_key: `${baseEvent.idempotency_key}:${event_id}`,
    event_type,
    action,
    raw_ref: { raw_event_id: `raw_${event_id}`, payload_hash: `sha256:${event_id}` }
  };
}

describe("phase 3 metrics", () => {
  test("derives tool totals, failures, command totals, and per-tool counts from normalized events", () => {
    const metrics = computeMetrics({
      provider: "codex",
      runId: "run_1",
      trialId: "trial_1",
      observedAt: "2026-06-20T12:01:00.000Z",
      events: [
        event("evt_1", "tool.requested", { name: "Bash", category: "tool", status: "requested" }),
        event("evt_2", "tool.completed", { name: "Bash", category: "tool", status: "completed" }),
        event("evt_3", "tool.requested", { name: "apply_patch", category: "tool", status: "requested" }),
        event("evt_4", "tool.failed", { name: "apply_patch", category: "tool", status: "failed" }),
        event("evt_5", "command.completed", { name: "npm test", category: "command", status: "completed" })
      ],
      artifacts: []
    });

    expect(metrics).toContainEqual(expect.objectContaining({
      metric: "tool_calls_total",
      value: 2,
      unit: "count",
      measurement_source: "derived",
      capture_source: "normalized_events",
      confidence: "high",
      supporting_event_id: "evt_1"
    }));
    expect(metrics).toContainEqual(expect.objectContaining({
      metric: "tool_calls_failed",
      value: 1,
      supporting_event_id: "evt_4"
    }));
    expect(metrics).toContainEqual(expect.objectContaining({
      metric: "tool_calls_by_type.apply_patch",
      value: 1,
      supporting_event_id: "evt_3"
    }));
    expect(metrics).toContainEqual(expect.objectContaining({
      metric: "commands_executed",
      value: 1,
      supporting_event_id: "evt_5"
    }));
  });

  test("derives output metrics from diff, test output, and transcript artifacts", () => {
    const metrics = computeMetrics({
      provider: "claude_code",
      runId: "run_1",
      trialId: "trial_1",
      observedAt: "2026-06-20T12:01:00.000Z",
      events: [],
      artifacts: [
        {
          run_id: "run_1",
          trial_id: "trial_1",
          kind: "diff",
          path: "/workspace/git.patch",
          content_hash: "sha256:diff",
          size_bytes: 150,
          content: [
            "diff --git a/src/login.ts b/src/login.ts",
            "--- a/src/login.ts",
            "+++ b/src/login.ts",
            "+export const added = true;",
            "-export const old = true;",
            "diff --git a/tests/login.test.ts b/tests/login.test.ts",
            "+expect(login()).toBe(true);"
          ].join("\n")
        },
        {
          run_id: "run_1",
          trial_id: "trial_1",
          kind: "test_output",
          path: "/workspace/test-output.txt",
          content_hash: "sha256:tests",
          size_bytes: 80,
          content: "Tests: 2 passed, 1 failed, 3 total"
        },
        {
          run_id: "run_1",
          trial_id: "trial_1",
          kind: "transcript",
          path: "/workspace/transcript.jsonl",
          content_hash: "sha256:transcript",
          size_bytes: 4096
        }
      ]
    });

    for (const metric of metrics) {
      expect(metric.measurement_source).toBeDefined();
      expect(metric.capture_source).toBeDefined();
      expect(metric.confidence).toBeDefined();
    }

    expect(metrics).toContainEqual(expect.objectContaining({
      metric: "files_changed",
      value: 2,
      capture_source: "artifact:diff",
      supporting_artifact_id: "sha256:diff"
    }));
    expect(metrics).toContainEqual(expect.objectContaining({ metric: "lines_added", value: 2 }));
    expect(metrics).toContainEqual(expect.objectContaining({ metric: "lines_removed", value: 1 }));
    expect(metrics).toContainEqual(expect.objectContaining({
      metric: "tests_total",
      value: 3,
      capture_source: "artifact:test_output",
      supporting_artifact_id: "sha256:tests"
    }));
    expect(metrics).toContainEqual(expect.objectContaining({ metric: "tests_failed", value: 1 }));
    expect(metrics).toContainEqual(expect.objectContaining({
      metric: "transcript_size_bytes",
      value: 4096,
      unit: "bytes",
      supporting_artifact_id: "sha256:transcript"
    }));
  });
});
