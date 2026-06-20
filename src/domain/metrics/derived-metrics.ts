import type { TrialArtifact } from "../artifacts/artifact.js";
import type { NormalizedEvent, HarnessProvider } from "../events/normalized-event.js";
import { MetricObservationSchema, type MetricObservation } from "./metric-observation.js";

export interface MetricArtifact extends TrialArtifact {
  readonly content?: string;
}

export interface DeriveMetricsInput {
  readonly provider: HarnessProvider;
  readonly runId: string;
  readonly trialId?: string;
  readonly observedAt: string;
  readonly events: readonly NormalizedEvent[];
  readonly artifacts: readonly MetricArtifact[];
}

export function deriveMetrics(input: DeriveMetricsInput): MetricObservation[] {
  return [
    ...deriveToolMetrics(input),
    ...deriveOutputMetrics(input)
  ];
}

function deriveToolMetrics(input: DeriveMetricsInput): MetricObservation[] {
  const requestedTools = input.events.filter((event) => event.event_type === "tool.requested");
  const failedTools = input.events.filter((event) => event.event_type === "tool.failed");
  const completedCommands = input.events.filter((event) => event.event_type === "command.completed");
  const metrics: MetricObservation[] = [];

  if (requestedTools.length > 0) {
    metrics.push(metric(input, {
      metric: "tool_calls_total",
      value: requestedTools.length,
      unit: "count",
      capture_source: "normalized_events",
      supporting_event_id: requestedTools[0]?.event_id
    }));
  }

  if (requestedTools.length > 0 || failedTools.length > 0) {
    metrics.push(metric(input, {
      metric: "tool_calls_failed",
      value: failedTools.length,
      unit: "count",
      capture_source: "normalized_events",
      supporting_event_id: failedTools[0]?.event_id ?? requestedTools[0]?.event_id
    }));
  }

  for (const [toolName, events] of groupBy(requestedTools, (event) => event.action.name ?? "unknown")) {
    metrics.push(metric(input, {
      metric: `tool_calls_by_type.${metricSegment(toolName)}`,
      value: events.length,
      unit: "count",
      capture_source: "normalized_events",
      supporting_event_id: events[0]?.event_id
    }));
  }

  if (completedCommands.length > 0) {
    metrics.push(metric(input, {
      metric: "commands_executed",
      value: completedCommands.length,
      unit: "count",
      capture_source: "normalized_events",
      supporting_event_id: completedCommands[0]?.event_id
    }));
  }

  return metrics;
}

function deriveOutputMetrics(input: DeriveMetricsInput): MetricObservation[] {
  const metrics: MetricObservation[] = [];

  for (const artifact of input.artifacts) {
    if (artifact.kind === "diff" && artifact.content !== undefined) {
      const diff = summarizeDiff(artifact.content);
      metrics.push(
        metric(input, {
          metric: "files_changed",
          value: diff.filesChanged,
          unit: "count",
          capture_source: "artifact:diff",
          supporting_artifact_id: artifact.content_hash
        }),
        metric(input, {
          metric: "lines_added",
          value: diff.linesAdded,
          unit: "lines",
          capture_source: "artifact:diff",
          supporting_artifact_id: artifact.content_hash
        }),
        metric(input, {
          metric: "lines_removed",
          value: diff.linesRemoved,
          unit: "lines",
          capture_source: "artifact:diff",
          supporting_artifact_id: artifact.content_hash
        })
      );
    }

    if (artifact.kind === "test_output" && artifact.content !== undefined) {
      const testSummary = summarizeTests(artifact.content);
      metrics.push(
        metric(input, {
          metric: "tests_total",
          value: testSummary.total,
          unit: "count",
          capture_source: "artifact:test_output",
          confidence: testSummary.total === 0 ? "low" : "medium",
          supporting_artifact_id: artifact.content_hash
        }),
        metric(input, {
          metric: "tests_passed",
          value: testSummary.passed,
          unit: "count",
          capture_source: "artifact:test_output",
          confidence: testSummary.total === 0 ? "low" : "medium",
          supporting_artifact_id: artifact.content_hash
        }),
        metric(input, {
          metric: "tests_failed",
          value: testSummary.failed,
          unit: "count",
          capture_source: "artifact:test_output",
          confidence: testSummary.total === 0 ? "low" : "medium",
          supporting_artifact_id: artifact.content_hash
        })
      );
    }

    if (artifact.kind === "transcript") {
      metrics.push(metric(input, {
        metric: "transcript_size_bytes",
        value: artifact.size_bytes,
        unit: "bytes",
        capture_source: "artifact:transcript",
        supporting_artifact_id: artifact.content_hash
      }));
    }
  }

  return metrics;
}

function metric(
  input: DeriveMetricsInput,
  fields: {
    readonly metric: string;
    readonly value: number;
    readonly unit: string;
    readonly capture_source: string;
    readonly confidence?: "high" | "medium" | "low" | "none";
    readonly supporting_event_id?: string;
    readonly supporting_artifact_id?: string;
  }
): MetricObservation {
  return MetricObservationSchema.parse({
    metric: fields.metric,
    value: fields.value,
    unit: fields.unit,
    measurement_source: "derived",
    capture_source: fields.capture_source,
    confidence: fields.confidence ?? "high",
    run_id: input.runId,
    trial_id: input.trialId,
    provider: input.provider,
    observed_at: input.observedAt,
    supporting_event_id: fields.supporting_event_id,
    supporting_artifact_id: fields.supporting_artifact_id
  });
}

function summarizeDiff(content: string): {
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
} {
  const files = new Set<string>();
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const line of content.split(/\r?\n/)) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffMatch?.[2]) {
      files.add(diffMatch[2]);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      linesAdded += 1;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      linesRemoved += 1;
    }
  }

  return { filesChanged: files.size, linesAdded, linesRemoved };
}

function summarizeTests(content: string): {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
} {
  const passed = numberBeforeWord(content, "passed");
  const failed = numberBeforeWord(content, "failed");
  const total = numberBeforeWord(content, "total") || passed + failed;

  return { total, passed, failed };
}

function numberBeforeWord(content: string, word: string): number {
  const match = content.match(new RegExp(`(\\d+)\\s+${word}`, "i"));
  return match?.[1] ? Number(match[1]) : 0;
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}

function metricSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
