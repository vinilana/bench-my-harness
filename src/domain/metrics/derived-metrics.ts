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
    ...deriveInteractionMetrics(input),
    ...deriveToolMetrics(input),
    ...deriveOutputMetrics(input)
  ];
}

function deriveInteractionMetrics(input: DeriveMetricsInput): MetricObservation[] {
  const promptEvents = input.events.filter((event) => event.event_type === "message.input");
  const turnEvents = input.events.filter((event) =>
    event.event_type === "turn.started" || event.event_type === "turn.ended"
  );
  const turnIds = [...new Set(turnEvents.flatMap((event) => event.run.turn_id === undefined ? [] : [event.run.turn_id]))];
  const interactions = turnIds.length > 0 ? turnIds.length : promptEvents.length;
  const supportingEvent = promptEvents[0] ?? turnEvents[0];

  if (interactions === 0 || supportingEvent === undefined) {
    return [];
  }

  return [metric(input, {
    metric: "agent_interactions_total",
    value: interactions,
    unit: "count",
    capture_source: "normalized_events",
    supporting_event_id: supportingEvent.event_id
  })];
}

function deriveToolMetrics(input: DeriveMetricsInput): MetricObservation[] {
  const primaryTools = dedupeToolObservations([
    ...input.events.filter((event) => event.event_type === "tool.requested").map((event) => toolObservation(event)),
    ...input.events.flatMap(batchToolObservations)
  ]);
  const terminalTools = input.events
    .filter((event) => event.event_type === "tool.completed" || event.event_type === "tool.failed")
    .map((event) => toolObservation(event));
  const observedTools = mergeTerminalToolObservations(primaryTools, terminalTools);
  const failedTools = observedTools.filter((tool) => tool.status === "failed");
  const completedCommands = input.events.filter((event) => event.event_type === "command.completed");
  const metrics: MetricObservation[] = [];
  const supportingEvent = observedTools[0]?.event ?? input.events[0];

  if (observedTools.length > 0 || supportingEvent !== undefined) {
    metrics.push(metric(input, {
      metric: "tool_calls_total",
      value: observedTools.length,
      unit: "count",
      capture_source: "normalized_events",
      supporting_event_id: supportingEvent?.event_id
    }));
  }

  if (observedTools.length > 0 || supportingEvent !== undefined) {
    metrics.push(metric(input, {
      metric: "tool_calls_failed",
      value: failedTools.length,
      unit: "count",
      capture_source: "normalized_events",
      supporting_event_id: failureEvent(failedTools[0])?.event_id ?? supportingEvent?.event_id
    }));
  }

  for (const [toolName, events] of groupBy(observedTools, (event) => event.name)) {
    metrics.push(metric(input, {
      metric: `tool_calls_by_type.${metricSegment(toolName)}`,
      value: events.length,
      unit: "count",
      capture_source: "normalized_events",
      supporting_event_id: events[0]?.event.event_id
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

function mergeTerminalToolObservations(
  primaryTools: readonly ToolObservation[],
  terminalTools: readonly ToolObservation[]
): ToolObservation[] {
  const merged = [...primaryTools];

  for (const terminal of terminalTools) {
    const existingIndex = matchingToolIndex(terminal, merged);
    if (existingIndex === undefined) {
      merged.push(terminal);
      continue;
    }

    if (terminal.status === "failed") {
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...existing,
        status: "failed",
        statusEvent: terminal.statusEvent ?? terminal.event
      };
    }
  }

  return dedupeToolObservations(merged);
}

function matchingToolIndex(tool: ToolObservation, tools: readonly ToolObservation[]): number | undefined {
  const index = tools.findIndex((candidate) =>
    tool.id !== undefined
      ? candidate.id === tool.id
      : candidate.id === undefined && candidate.name === tool.name
  );

  return index === -1 ? undefined : index;
}

function failureEvent(tool: ToolObservation | undefined): NormalizedEvent | undefined {
  return tool?.statusEvent ?? tool?.event;
}

function failedToolObservation(existing: ToolObservation, failed: ToolObservation): ToolObservation {
  return {
    ...existing,
    status: "failed",
    statusEvent: failed.statusEvent ?? failed.event
  };
}

function shouldMergeFailedTool(existing: ToolObservation, candidate: ToolObservation): boolean {
  return existing.status !== "failed" && candidate.status === "failed";
}

function sameToolIdentity(left: ToolObservation, right: ToolObservation): boolean {
  if (left.id !== undefined && right.id !== undefined) {
    return left.id === right.id;
  }

  return false;
}

interface ToolObservation {
  readonly name: string;
  readonly status: string;
  readonly id?: string;
  readonly event: NormalizedEvent;
  readonly statusEvent?: NormalizedEvent;
}

function toolObservation(event: NormalizedEvent): ToolObservation {
  const payload = recordValue(event.payload);

  return {
    name: event.action.name ?? "unknown",
    status: event.action.status,
    id: payload === undefined
      ? undefined
      : stringValue(payload["tool_use_id"]) ?? stringValue(payload["id"]),
    event,
    statusEvent: event.action.status === "failed" ? event : undefined
  };
}

function batchToolObservations(event: NormalizedEvent): ToolObservation[] {
  if (event.action.category !== "tool_batch") {
    return [];
  }

  const payload = recordValue(event.payload);
  const tools = Array.isArray(payload?.["tools"]) ? payload["tools"] : [];

  return tools.flatMap((tool) => {
    const record = recordValue(tool);
    if (record === undefined) {
      return [];
    }

    const status = stringValue(record["status"]) ?? stringValue(record["state"]) ?? "completed";
    return [{
      name: stringValue(record["name"]) ?? stringValue(record["tool_name"]) ?? "unknown",
      status,
      id: stringValue(record["tool_use_id"]) ?? stringValue(record["id"]),
      event,
      statusEvent: status === "failed" ? event : undefined
    }];
  });
}

function dedupeToolObservations(tools: readonly ToolObservation[]): ToolObservation[] {
  const deduped: ToolObservation[] = [];
  const seenIds = new Set<string>();

  for (const tool of tools) {
    if (tool.id === undefined) {
      deduped.push(tool);
      continue;
    }

    if (seenIds.has(tool.id)) {
      const existingIndex = deduped.findIndex((candidate) => sameToolIdentity(candidate, tool));
      if (existingIndex !== -1 && shouldMergeFailedTool(deduped[existingIndex], tool)) {
        deduped[existingIndex] = failedToolObservation(deduped[existingIndex], tool);
      }
      continue;
    }

    seenIds.add(tool.id);
    deduped.push(tool);
  }

  return deduped;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
