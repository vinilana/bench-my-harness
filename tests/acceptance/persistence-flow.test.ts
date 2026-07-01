import { describe, expect, test } from "vitest";

import { InMemoryArtifactStore } from "../../src/adapters/outbound/storage/in-memory-artifact-store.js";
import { InMemoryMetricStore } from "../../src/adapters/outbound/storage/in-memory-metric-store.js";
import { InMemoryNormalizedEventStore } from "../../src/adapters/outbound/storage/in-memory-normalized-event-store.js";
import { InMemoryRawEventStore } from "../../src/adapters/outbound/storage/in-memory-raw-event-store.js";
import { InMemoryReportStore } from "../../src/adapters/outbound/storage/in-memory-report-store.js";
import { BenchmarkReportRenderer } from "../../src/adapters/outbound/reports/benchmark-report-renderer.js";
import { normalizeRawHookEvent } from "../../src/adapters/outbound/harnesses/provider-raw-hook-event-normalizer.js";
import { queryRunReport } from "../../src/application/use-cases/query-run-report.js";
import { ExportReportUseCase, type ExportReportInput } from "../../src/application/use-cases/export-report.js";
import secretBearingEvent from "../fixtures/security/secret-bearing-event.json" with { type: "json" };

describe("persistence flow", () => {
  test("metric store enforces idempotency by run, trial, metric, and evidence", async () => {
    const store = new InMemoryMetricStore();
    const first = await store.append({
      metric: "tool_calls_total",
      value: 1,
      unit: "count",
      measurement_source: "derived",
      capture_source: "normalized_events",
      confidence: "high",
      run_id: "run_1",
      trial_id: "trial_1",
      provider: "codex",
      observed_at: "2026-06-20T12:00:00.000Z",
      supporting_event_id: "evt_1"
    });
    const second = await store.append({
      ...first,
      value: 99,
      observed_at: "2026-06-20T12:01:00.000Z"
    });

    expect(second).toEqual(first);
    await expect(store.count()).resolves.toBe(1);
    await expect(store.list({ run_id: "run_1", trial_id: "trial_1" })).resolves.toEqual([first]);
  });

  test("artifact store enforces idempotency by content hash, kind, run, and trial", async () => {
    const store = new InMemoryArtifactStore();
    const first = await store.append({
      run_id: "run_1",
      trial_id: "trial_1",
      kind: "diff",
      path: "/workspace/git.patch",
      content_hash: "sha256:diff",
      size_bytes: 42,
      content: "diff --git a/a b/a\n+added\n"
    });
    const second = await store.append({
      ...first,
      path: "/workspace/copy.patch",
      size_bytes: 100
    });

    expect(second).toEqual(first);
    await expect(store.count()).resolves.toBe(1);
    await expect(store.list({ run_id: "run_1", trial_id: "trial_1", kind: "diff" })).resolves.toEqual([first]);
  });

  test("queries a deterministic raw to normalized to metrics and artifacts report projection without raw secrets", async () => {
    const rawStore = new InMemoryRawEventStore();
    const normalizedStore = new InMemoryNormalizedEventStore();
    const metricStore = new InMemoryMetricStore();
    const artifactStore = new InMemoryArtifactStore();
    const reportStore = new InMemoryReportStore();

    const raw = await rawStore.append({
      provider: "codex",
      run_id: "run_report",
      trial_id: "trial_report",
      observed_at: "2026-06-20T12:00:00.000Z",
      payload: secretBearingEvent
    });
    const normalized = await normalizedStore.append({
      ...normalizeRawHookEvent(raw),
      event_id: "evt_report_prompt",
      idempotency_key: "codex:run_report:trial_report:prompt"
    });
    const artifact = await artifactStore.append({
      run_id: "run_report",
      trial_id: "trial_report",
      kind: "test_output",
      path: "/workspace/test-output.txt",
      content_hash: "sha256:test-output",
      size_bytes: 31,
      content: "Tests: 1 passed, 0 failed, 1 total"
    });
    await metricStore.append({
      metric: "tool_calls_total",
      value: 1,
      unit: "count",
      measurement_source: "derived",
      capture_source: "normalized_events",
      confidence: "high",
      run_id: "run_report",
      trial_id: "trial_report",
      provider: "codex",
      observed_at: "2026-06-20T12:01:00.000Z",
      supporting_event_id: normalized.event_id
    });
    await metricStore.append({
      metric: "tests_total",
      value: 1,
      unit: "count",
      measurement_source: "derived",
      capture_source: "artifact:test_output",
      confidence: "medium",
      run_id: "run_report",
      trial_id: "trial_report",
      provider: "codex",
      observed_at: "2026-06-20T12:01:00.000Z",
      supporting_artifact_id: artifact.content_hash
    });
    const reportState = await reportStore.save({
      run_id: "run_report",
      benchmark: { id: "login-validation", version: "1.0.0" },
      provider: "codex",
      generated_at: "2026-06-20T12:05:00.000Z",
      evaluation: {
        score_total: 80,
        statistics: {
          trials: 1,
          inconclusive_trials: 0,
          mean: 80,
          median: 80,
          min: 80,
          max: 80,
          stddev: 0
        }
      },
      comparability: { status: "comparable", reasons: [] },
      effective_observability: {
        tool_calls: "partial",
        tool_results: "partial",
        assistant_output: "derived",
        token_usage: "unavailable_from_hooks",
        context_usage: "unavailable_from_hooks",
        cost: "unavailable"
      },
      adapter_capabilities: ["codex_hooks", "project_local_hooks"],
      security: {
        redaction: {
          status: "applied",
          raw_payloads_included: false
        }
      },
      notes: [
        "raw hook payloads withheld from report projection",
        "Authorization: Bearer secret-token",
        "OPENAI_API_KEY=sk-test-1234567890"
      ]
    });
    await expect(reportStore.save({
      ...reportState,
      generated_at: "2026-06-20T12:06:00.000Z"
    })).resolves.toEqual(reportState);

    const report = await queryRunReport({
      run_id: "run_report",
      reportStore,
      metricStore,
      artifactStore,
      rawEventStore: rawStore,
      normalizedEventStore: normalizedStore
    });

    expect(report.metrics.map((metric) => metric.metric)).toEqual(["tool_calls_total", "tests_total"]);
    expect(report.raw_payloads).toBeUndefined();
    expect(JSON.stringify(report)).not.toContain("sk-test-1234567890");
    expect(JSON.stringify(report)).not.toContain("secret-token");
    expect(report.notes).toContain("Authorization: Bearer [REDACTED]");
    expect(report.notes).toContain("OPENAI_API_KEY=[REDACTED]");
    expect(exportReport({ format: "json", report })).toContain("\"raw_payloads_included\": false");
  });
});

function exportReport(input: ExportReportInput): string {
  return new ExportReportUseCase(new BenchmarkReportRenderer()).execute(input);
}
