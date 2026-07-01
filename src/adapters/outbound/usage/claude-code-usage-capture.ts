import type {
  MetricObservation,
  NormalizedUsageCapturePort,
  UsageCaptureContext,
  UsageLlmObservation,
  UsageReport,
  UsageValueObservation
} from "../../../application/ports/usage-capture-port.js";
import {
  collectMcpUsage,
  collectSkillUsage,
  isRecord,
  loadTextEvidence,
  modelProvider,
  nestedNumber,
  nestedString,
  stringValue,
  textEvidence,
  tokenTotalFromUsage,
  unwrappedPayloadRecord,
  unavailableSubagentUsage,
  unavailableValue,
  usageReport,
  usageToMetricObservations,
  valueObservation
} from "./usage-capture-helpers.js";
import type { LoadedEvidence, UnknownRecord } from "./usage-capture-helpers.js";
import { calculateClaudeCostUsd } from "./claude-pricing.js";
import type { ClaudePricingTokenUsage } from "./claude-pricing.js";

export interface ClaudeCodeUsageCaptureOptions {
  readonly hooksJsonlPath?: string;
  readonly transcriptJsonlPath?: string;
  readonly statusLineJsonlPath?: string;
  readonly processStdoutPath?: string;
  readonly processStderrPath?: string;
  readonly otelJsonlPath?: string;
}

export class ClaudeCodeUsageCapture implements NormalizedUsageCapturePort {
  readonly #options: ClaudeCodeUsageCaptureOptions;

  constructor(options: ClaudeCodeUsageCaptureOptions) {
    this.#options = options;
  }

  async capture(context: UsageCaptureContext): Promise<readonly MetricObservation[]> {
    const report = await this.captureUsage(context);
    return usageToMetricObservations(context, report);
  }

  async captureUsage(_context: UsageCaptureContext): Promise<UsageReport> {
    const hooks = await loadTextEvidence(this.#options.hooksJsonlPath ?? _context.hookSpoolPath);
    const transcript = await loadTextEvidence(this.#options.transcriptJsonlPath ?? _context.transcriptPath);
    const statusLine = await loadTextEvidence(this.#options.statusLineJsonlPath ?? _context.statusLineJsonlPath);
    const otel = await loadTextEvidence(this.#options.otelJsonlPath ?? _context.otelJsonlPath);
    const stdout = _context.processStdout !== undefined
      ? textEvidence("process-stdout.txt", _context.processStdout, { parseJsonl: false })
      : await loadTextEvidence(this.#options.processStdoutPath ?? _context.processStdoutPath, { parseJsonl: false });
    const stderr = _context.processStderr !== undefined
      ? textEvidence("process-stderr.txt", _context.processStderr, { parseJsonl: false })
      : await loadTextEvidence(this.#options.processStderrPath ?? _context.processStderrPath, { parseJsonl: false });
    const statusRecords = (statusLine?.records ?? []).map(unwrappedPayloadRecord);
    const otelRecords = (otel?.records ?? []).map(unwrappedPayloadRecord);
    const hookRecords = (hooks?.records ?? []).map(unwrappedPayloadRecord);
    const transcriptRecords = (transcript?.records ?? []).map(unwrappedPayloadRecord);
    const transcriptEvidenceRef = _context.transcriptEvidenceRef ?? transcript?.file.ref;
    const otelUsage = claudeOtelUsage(otelRecords, otel);
    const transcriptUsage = claudeTranscriptUsage(transcriptRecords, transcript, transcriptEvidenceRef);
    const statusUsage = claudeStatusLineUsage(statusRecords, statusLine);
    const processUsage = claudeProcessUsage([stdout, stderr]);

    return usageReport({
      llms: claudeLlms(otelUsage, statusRecords, statusLine, hookRecords, hooks, transcriptRecords, transcript, transcriptUsage, transcriptEvidenceRef, processUsage),
      tokens: otelUsage?.tokens ?? transcriptUsage?.tokens ?? {
        total: statusUsage?.tokens.total ?? claudeTokenTotal(statusRecords, statusLine) ?? processUsage?.tokens.total ?? null,
        input: statusUsage?.tokens.input ?? processUsage?.tokens.input ?? null,
        output: statusUsage?.tokens.output ?? processUsage?.tokens.output ?? null,
        cache_read: statusUsage?.tokens.cache_read ?? processUsage?.tokens.cache_read ?? null,
        cache_write: statusUsage?.tokens.cache_write ?? processUsage?.tokens.cache_write ?? null
      },
      cost: {
        total_usd: otelUsage?.cost
          ?? transcriptUsage?.cost
          ?? statusUsage?.cost
          ?? processUsage?.cost
          ?? unavailableValue("usd", "usage_capture", "no native billing or pricing source configured")
      },
      subagents: hooks === undefined ? [] : claudeSubagents(hookRecords, hooks),
      skills: transcript === undefined || transcriptEvidenceRef === undefined
        ? []
        : collectSkillUsage("claude_code", transcriptRecords, "transcript", transcriptEvidenceRef),
      mcps: hooks === undefined ? [] : collectMcpUsage(hookRecords, hooks.file.ref)
    });
  }
}

function claudeLlms(
  otelUsage: ClaudeOtelUsage | undefined,
  statusRecords: readonly UnknownRecord[],
  statusLine: LoadedEvidence | undefined,
  hookRecords: readonly UnknownRecord[],
  hooks: LoadedEvidence | undefined,
  transcriptRecords: readonly UnknownRecord[],
  transcript: LoadedEvidence | undefined,
  transcriptUsage: ClaudeTranscriptUsage | undefined,
  transcriptEvidenceRef: string | undefined,
  processUsage: ClaudeProcessUsage | undefined
): UsageLlmObservation[] {
  if (otelUsage !== undefined && otelUsage.models.length > 0) {
    return otelUsage.models.map((model) =>
      llm(model, "primary", "native", "claude_otel", "high", otelUsage.evidenceRef)
    );
  }

  const statusModel = firstModel(statusRecords);
  if (statusModel !== undefined && statusLine !== undefined) {
    return [llm(statusModel, "primary", "native", "claude_status_line_json", "medium", statusLine.file.ref)];
  }

  const hookModel = firstModel(hookRecords);
  if (hookModel !== undefined && hooks !== undefined) {
    return [llm(hookModel, "primary", "native", "claude_hook_payload", "high", hooks.file.ref)];
  }

  if (transcriptUsage !== undefined && transcriptEvidenceRef !== undefined) {
    return transcriptUsage.models.map((model) =>
      llm(model, "primary", "native", "claude_transcript", "medium", transcriptEvidenceRef)
    );
  }

  const transcriptModel = firstModel(transcriptRecords);
  if (transcriptModel !== undefined && transcript !== undefined) {
    return [llm(transcriptModel, "primary", "derived", "transcript", "medium", transcript.file.ref)];
  }

  if (processUsage !== undefined) {
    return processUsage.models.map((model) =>
      llm(model, "primary", "native", "claude_cli_process_json", "medium", processUsage.evidenceRef)
    );
  }

  return [];
}

function llm(
  model: string,
  role: "primary" | "subagent",
  measurement_source: "native" | "derived",
  capture_source: string,
  confidence: "high" | "medium",
  evidenceRef: string
): UsageLlmObservation {
  return {
    model,
    provider: modelProvider("claude_code"),
    role,
    measurement_source,
    capture_source,
    confidence,
    evidence_refs: [evidenceRef]
  };
}

function claudeTokenTotal(records: readonly UnknownRecord[], statusLine: LoadedEvidence | undefined): UsageValueObservation | null {
  if (statusLine === undefined) {
    return null;
  }

  for (const record of records) {
    const total = tokenTotalFromUsage(record);
    if (total !== undefined) {
      return valueObservation({
        value: total,
        unit: "tokens",
        measurement_source: "native",
        capture_source: "claude_status_line_json",
        confidence: "medium",
        evidence_refs: [statusLine.file.ref]
      });
    }
  }

  return unavailableValue("tokens", "claude_status_line_json", "claude status line did not include total token usage");
}

function claudeSubagents(records: readonly UnknownRecord[], hooks: LoadedEvidence) {
  const subagents = new Map<string, {
    name?: string;
    started_at?: string;
    ended_at?: string;
    llms?: UsageLlmObservation[];
    tokensTotal?: UsageValueObservation;
  }>();

  for (const record of records) {
    const toolName = stringValue(record, "tool_name");
    const eventName = stringValue(record, "hook_event_name");
    if (eventName === "TaskCreate" || eventName === "TaskUpdate") {
      const id = stringValue(record, "task_id") ?? stringValue(record, "id") ?? stringValue(record, "tool_use_id");
      if (id === undefined) {
        continue;
      }

      const current = subagents.get(id) ?? {};
      const model = stringValue(record, "model") ?? nestedString(record, ["task", "model"]);
      subagents.set(id, {
        ...current,
        name: stringValue(record, "task_name")
          ?? stringValue(record, "subagent_type")
          ?? nestedString(record, ["task", "name"])
          ?? current.name,
        started_at: eventName === "TaskCreate"
          ? stringValue(record, "occurred_at") ?? stringValue(record, "timestamp")
          : current.started_at,
        ended_at: eventName === "TaskUpdate" && taskUpdateCompleted(record)
          ? stringValue(record, "occurred_at") ?? stringValue(record, "timestamp")
          : current.ended_at,
        llms: model === undefined ? current.llms : [
          llm(model, "subagent", "derived", "hook_events", "medium", hooks.file.ref)
        ],
        tokensTotal: current.tokensTotal
      });
      continue;
    }

    if (toolName !== "Task" && toolName !== "Agent") {
      continue;
    }

    const id = stringValue(record, "tool_use_id") ?? stringValue(record, "id");
    if (id === undefined) {
      continue;
    }

    const current = subagents.get(id) ?? {};
    const total = tokenTotalFromUsage(record);
    const model = nestedString(record, ["tool_response", "model"]) ?? stringValue(record, "model");
    const updated = {
      ...current,
      name: nestedString(record, ["tool_input", "subagent_type"]) ?? nestedString(record, ["tool_input", "name"]) ?? current.name,
      started_at: eventName === "PreToolUse" ? stringValue(record, "occurred_at") : current.started_at,
      ended_at: eventName === "PostToolUse" ? stringValue(record, "occurred_at") : current.ended_at,
      llms: model === undefined ? current.llms : [
        llm(model, "subagent", "derived", "hook_events", "medium", hooks.file.ref)
      ],
      tokensTotal: total === undefined ? current.tokensTotal : valueObservation({
        value: total,
        unit: "tokens",
        measurement_source: "native",
        capture_source: "hook_events",
        confidence: "medium",
        evidence_refs: [hooks.file.ref]
      })
    };
    subagents.set(id, updated);
  }

  return [...subagents.entries()].map(([id, fields]) =>
    unavailableSubagentUsage(id, {
      ...fields,
      evidence_refs: [hooks.file.ref]
    })
  );
}

function taskUpdateCompleted(record: UnknownRecord): boolean {
  const status = stringValue(record, "status") ?? stringValue(record, "state");
  return status === undefined || ["completed", "complete", "done", "failed", "error"].includes(status);
}

function firstModel(records: readonly UnknownRecord[]): string | undefined {
  for (const record of records) {
    const model = stringValue(record, "model")
      ?? nestedString(record, ["message", "model"])
      ?? nestedString(record, ["data", "message", "message", "model"])
      ?? nestedString(record, ["tool_response", "model"]);
    if (model !== undefined) {
      return model;
    }
  }

  return undefined;
}

interface ClaudeTranscriptUsage {
  readonly models: readonly string[];
  readonly tokens: {
    readonly total: UsageValueObservation;
    readonly input: UsageValueObservation;
    readonly output: UsageValueObservation;
    readonly cache_read: UsageValueObservation;
    readonly cache_write: UsageValueObservation;
  };
  readonly cost: UsageValueObservation;
}

interface ClaudeStatusLineUsage {
  readonly tokens: {
    readonly total: UsageValueObservation;
    readonly input: UsageValueObservation | null;
    readonly output: UsageValueObservation | null;
    readonly cache_read: UsageValueObservation | null;
    readonly cache_write: UsageValueObservation | null;
  };
  readonly cost?: UsageValueObservation;
}

interface ClaudeProcessUsage {
  readonly models: readonly string[];
  readonly tokens: ClaudeTranscriptUsage["tokens"];
  readonly cost?: UsageValueObservation;
  readonly evidenceRef: string;
}

interface ClaudeOtelUsage {
  readonly models: readonly string[];
  readonly evidenceRef: string;
  readonly tokens?: {
    readonly total: UsageValueObservation;
    readonly input: UsageValueObservation;
    readonly output: UsageValueObservation;
    readonly cache_read: UsageValueObservation;
    readonly cache_write: UsageValueObservation;
  };
  readonly cost?: UsageValueObservation;
}

interface ClaudeTranscriptEntry {
  readonly messageId: string;
  readonly requestId?: string;
  readonly isSidechain: boolean;
  readonly model: string;
  readonly usage: ClaudeTranscriptTokenUsage;
  readonly nativeCostUsd?: number;
}

interface ClaudeTranscriptTokenUsage extends ClaudePricingTokenUsage {
  readonly totalTokens: number;
}

function claudeOtelUsage(
  records: readonly UnknownRecord[],
  otel: LoadedEvidence | undefined
): ClaudeOtelUsage | undefined {
  if (otel === undefined) {
    return undefined;
  }

  const metricTokens = emptyOtelTokenAccumulator();
  const eventTokens = emptyOtelTokenAccumulator();
  let metricCost = 0;
  let eventCost = 0;
  let hasMetricCost = false;
  let hasEventCost = false;
  const models = new Set<string>();

  for (const record of expandOtelRecords(records)) {
    const attributes = otelAttributes(record);
    const name = otelRecordName(record, attributes);
    const model = otelString(record, attributes, "model");
    if (model !== undefined) {
      models.add(model);
    }

    if (name === "claude_code.token.usage") {
      const value = otelNumber(record, attributes, "value");
      const tokenType = otelString(record, attributes, "type");
      const bucket = otelTokenBucket(tokenType);
      if (value !== undefined && bucket !== undefined) {
        addOtelToken(metricTokens, bucket, value);
      }
      continue;
    }

    if (name === "claude_code.cost.usage") {
      const value = otelNumber(record, attributes, "value");
      if (value !== undefined) {
        metricCost += value;
        hasMetricCost = true;
      }
      continue;
    }

    if (isClaudeApiRequestEvent(record, attributes, name)) {
      addOptionalOtelToken(eventTokens, "input", otelNumber(record, attributes, "input_tokens"));
      addOptionalOtelToken(eventTokens, "output", otelNumber(record, attributes, "output_tokens"));
      addOptionalOtelToken(eventTokens, "cache_read", otelNumber(record, attributes, "cache_read_tokens"));
      addOptionalOtelToken(eventTokens, "cache_write", otelNumber(record, attributes, "cache_creation_tokens"));

      const cost = otelNumber(record, attributes, "cost_usd");
      if (cost !== undefined) {
        eventCost += cost;
        hasEventCost = true;
      }
    }
  }

  const tokens = metricTokens.hasTokens
    ? metricTokens
    : eventTokens.hasTokens ? eventTokens : undefined;
  const cost = hasMetricCost ? metricCost : hasEventCost ? eventCost : undefined;
  if (models.size === 0 && tokens === undefined && cost === undefined) {
    return undefined;
  }

  const evidenceRefs = [otel.file.ref];
  const tokenObservation = (value: number) => valueObservation({
    value,
    unit: "tokens",
    measurement_source: "native",
    capture_source: "claude_otel",
    confidence: "high",
    evidence_refs: evidenceRefs
  });

  return {
    models: [...models],
    evidenceRef: otel.file.ref,
    tokens: tokens === undefined ? undefined : {
      total: tokenObservation(tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite),
      input: tokenObservation(tokens.input),
      output: tokenObservation(tokens.output),
      cache_read: tokenObservation(tokens.cacheRead),
      cache_write: tokenObservation(tokens.cacheWrite)
    },
    cost: cost === undefined ? undefined : valueObservation({
      value: cost,
      unit: "usd",
      measurement_source: "native",
      capture_source: "claude_otel",
      confidence: "high",
      evidence_refs: evidenceRefs
    })
  };
}

function emptyOtelTokenAccumulator(): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  hasTokens: boolean;
} {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    hasTokens: false
  };
}

function addOptionalOtelToken(
  accumulator: ReturnType<typeof emptyOtelTokenAccumulator>,
  bucket: "input" | "output" | "cache_read" | "cache_write",
  value: number | undefined
): void {
  if (value !== undefined) {
    addOtelToken(accumulator, bucket, value);
  }
}

function addOtelToken(
  accumulator: ReturnType<typeof emptyOtelTokenAccumulator>,
  bucket: "input" | "output" | "cache_read" | "cache_write",
  value: number
): void {
  accumulator.hasTokens = true;
  if (bucket === "input") {
    accumulator.input += value;
  } else if (bucket === "output") {
    accumulator.output += value;
  } else if (bucket === "cache_read") {
    accumulator.cacheRead += value;
  } else {
    accumulator.cacheWrite += value;
  }
}

function otelTokenBucket(value: string | undefined): "input" | "output" | "cache_read" | "cache_write" | undefined {
  const normalized = value?.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "input") {
    return "input";
  }
  if (normalized === "output") {
    return "output";
  }
  if (normalized === "cacheread") {
    return "cache_read";
  }
  if (normalized === "cachecreation" || normalized === "cachewrite") {
    return "cache_write";
  }
  return undefined;
}

function isClaudeApiRequestEvent(
  record: UnknownRecord,
  attributes: UnknownRecord,
  name: string | undefined
): boolean {
  const eventName = otelString(record, attributes, "event.name") ?? otelString(record, attributes, "event_name");
  return name === "claude_code.api_request" || eventName === "api_request";
}

function expandOtelRecords(records: readonly UnknownRecord[]): UnknownRecord[] {
  return records.flatMap((record) => [
    record,
    ...expandOtelResourceMetrics(record),
    ...expandOtelResourceLogs(record)
  ]);
}

function expandOtelResourceMetrics(record: UnknownRecord): UnknownRecord[] {
  const expanded: UnknownRecord[] = [];

  for (const resourceMetric of recordArray(record["resourceMetrics"])) {
    const resourceAttributes = isRecord(resourceMetric["resource"])
      ? otelAttributes(resourceMetric["resource"])
      : {};
    for (const scopeMetric of recordArray(resourceMetric["scopeMetrics"])) {
      for (const metric of recordArray(scopeMetric["metrics"])) {
        const name = stringValue(metric, "name");
        for (const dataPoint of metricDataPoints(metric)) {
          expanded.push({
            name,
            value: otelNumber(dataPoint, {}, "value")
              ?? otelNumber(dataPoint, {}, "asDouble")
              ?? otelNumber(dataPoint, {}, "asInt"),
            attributes: {
              ...resourceAttributes,
              ...otelAttributes(dataPoint)
            }
          });
        }
      }
    }
  }

  return expanded;
}

function expandOtelResourceLogs(record: UnknownRecord): UnknownRecord[] {
  const expanded: UnknownRecord[] = [];

  for (const resourceLog of recordArray(record["resourceLogs"])) {
    const resourceAttributes = isRecord(resourceLog["resource"])
      ? otelAttributes(resourceLog["resource"])
      : {};
    for (const scopeLog of recordArray(resourceLog["scopeLogs"])) {
      for (const logRecord of recordArray(scopeLog["logRecords"])) {
        expanded.push({
          ...logRecord,
          attributes: {
            ...resourceAttributes,
            ...otelAttributes(logRecord)
          }
        });
      }
    }
  }

  return expanded;
}

function metricDataPoints(metric: UnknownRecord): UnknownRecord[] {
  const containers = [
    metric["sum"],
    metric["gauge"]
  ];

  return containers.flatMap((container) => {
    if (!isRecord(container)) {
      return [];
    }
    return [
      ...recordArray(container["dataPoints"]),
      ...recordArray(container["points"])
    ];
  });
}

function recordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function otelAttributes(record: UnknownRecord): UnknownRecord {
  return normalizedOtelAttributes(record["attributes"]);
}

function normalizedOtelAttributes(value: unknown): UnknownRecord {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }
      const key = stringValue(entry, "key");
      if (key === undefined) {
        return [];
      }
      return [[key, unwrapOtelValue(entry["value"])]];
    }));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, unwrapOtelValue(nested)])
    );
  }

  return {};
}

function unwrapOtelValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  for (const key of ["stringValue", "intValue", "doubleValue", "boolValue", "value"] as const) {
    if (key in value) {
      return unwrapOtelValue(value[key]);
    }
  }

  return value;
}

function otelRecordName(record: UnknownRecord, attributes: UnknownRecord): string | undefined {
  return stringValue(record, "name")
    ?? stringValue(record, "metric")
    ?? stringValue(record, "metricName")
    ?? nestedString(record, ["metric", "name"])
    ?? stringFromUnknown(attributes["metric.name"])
    ?? stringFromUnknown(attributes["event.name"]);
}

function otelString(record: UnknownRecord, attributes: UnknownRecord, key: string): string | undefined {
  return stringFromUnknown(attributes[key]) ?? stringFromUnknown(record[key]);
}

function otelNumber(record: UnknownRecord, attributes: UnknownRecord, key: string): number | undefined {
  return numberFromUnknown(attributes[key]) ?? numberFromUnknown(record[key]);
}

function stringFromUnknown(value: unknown): string | undefined {
  const unwrapped = unwrapOtelValue(value);
  return typeof unwrapped === "string" && unwrapped.length > 0 ? unwrapped : undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  const unwrapped = unwrapOtelValue(value);
  if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) {
    return unwrapped;
  }
  if (typeof unwrapped === "string" && unwrapped.trim().length > 0) {
    const parsed = Number(unwrapped);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function claudeTranscriptUsage(
  records: readonly UnknownRecord[],
  transcript: LoadedEvidence | undefined,
  transcriptEvidenceRef: string | undefined
): ClaudeTranscriptUsage | undefined {
  if (transcript === undefined || transcriptEvidenceRef === undefined) {
    return undefined;
  }

  const entries = dedupeClaudeTranscriptEntries(records.flatMap((record) => {
    const entry = claudeTranscriptEntry(record);
    return entry === undefined ? [] : [entry];
  }));
  if (entries.length === 0) {
    return undefined;
  }

  const aggregate = entries.reduce((current, entry) => ({
    inputTokens: current.inputTokens + entry.usage.inputTokens,
    outputTokens: current.outputTokens + entry.usage.outputTokens,
    cacheCreationInputTokens: current.cacheCreationInputTokens + entry.usage.cacheCreationInputTokens,
    cacheReadInputTokens: current.cacheReadInputTokens + entry.usage.cacheReadInputTokens,
    totalTokens: current.totalTokens + entry.usage.totalTokens
  }), {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0
  });
  const evidenceRefs = [transcriptEvidenceRef];
  const token = (value: number) => valueObservation({
    value,
    unit: "tokens",
    measurement_source: "native",
    capture_source: "claude_transcript",
    confidence: "medium",
    evidence_refs: evidenceRefs
  });

  return {
    models: unique(entries.map((entry) => entry.model)),
    tokens: {
      total: token(aggregate.totalTokens),
      input: token(aggregate.inputTokens),
      output: token(aggregate.outputTokens),
      cache_read: token(aggregate.cacheReadInputTokens),
      cache_write: token(aggregate.cacheCreationInputTokens)
    },
    cost: claudeTranscriptCost(entries, evidenceRefs)
  };
}

function claudeStatusLineUsage(
  records: readonly UnknownRecord[],
  statusLine: LoadedEvidence | undefined
): ClaudeStatusLineUsage | undefined {
  if (statusLine === undefined) {
    return undefined;
  }

  const entries = records.flatMap((record) => {
    const usage = usageRecordFromProcess(record);
    const total = tokenTotalFromUsage(record);
    if (usage === undefined || total === undefined) {
      return [];
    }

    return [{
      record,
      usage,
      total
    }];
  });
  const entry = entries.at(-1);
  if (entry === undefined) {
    return undefined;
  }

  const evidenceRefs = [statusLine.file.ref];
  const token = (value: number) => valueObservation({
    value,
    unit: "tokens",
    measurement_source: "native",
    capture_source: "claude_status_line_json",
    confidence: "medium",
    evidence_refs: evidenceRefs
  });
  const cacheCreation = cacheCreationTokenCount(entry.usage);
  const cacheRead = numberValue(entry.usage, "cache_read_input_tokens");
  const cost = processCostUsd(entry.record);

  return {
    tokens: {
      total: token(entry.total),
      input: optionalObservation(numberValue(entry.usage, "input_tokens"), token),
      output: optionalObservation(numberValue(entry.usage, "output_tokens"), token),
      cache_read: optionalObservation(cacheRead, token),
      cache_write: optionalObservation(cacheCreation.total === 0 ? undefined : cacheCreation.total, token)
    },
    cost: cost === undefined
      ? undefined
      : valueObservation({
          value: cost,
          unit: "usd",
          measurement_source: "native",
          capture_source: "claude_status_line_json",
          confidence: "medium",
          evidence_refs: evidenceRefs
        })
  };
}

function optionalObservation(
  value: number | undefined,
  observation: (value: number) => UsageValueObservation
): UsageValueObservation | null {
  return value === undefined ? null : observation(value);
}

function claudeProcessUsage(evidenceSources: readonly (LoadedEvidence | undefined)[]): ClaudeProcessUsage | undefined {
  for (const evidence of evidenceSources) {
    if (evidence === undefined) {
      continue;
    }

    const entries = parseClaudeProcessJsonRecords(evidence.text).flatMap((record) => {
      const usageRecord = usageRecordFromProcess(record);
      const usage = usageRecord === undefined ? undefined : claudeTranscriptTokenUsage(usageRecord);
      if (usage === undefined || usage.totalTokens <= 0) {
        return [];
      }

      return [{
        model: firstModel([record]),
        usage,
        nativeCostUsd: processCostUsd(record)
      }];
    });
    const entry = entries.at(-1);
    if (entry === undefined) {
      continue;
    }

    const evidenceRefs = [evidence.file.ref];
    const token = (value: number) => valueObservation({
      value,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "claude_cli_process_json",
      confidence: "medium",
      evidence_refs: evidenceRefs
    });

    return {
      models: entry.model === undefined ? [] : [entry.model],
      evidenceRef: evidence.file.ref,
      tokens: {
        total: token(entry.usage.totalTokens),
        input: token(entry.usage.inputTokens),
        output: token(entry.usage.outputTokens),
        cache_read: token(entry.usage.cacheReadInputTokens),
        cache_write: token(entry.usage.cacheCreationInputTokens)
      },
      cost: entry.nativeCostUsd === undefined ? undefined : valueObservation({
        value: entry.nativeCostUsd,
        unit: "usd",
        measurement_source: "native",
        capture_source: "claude_cli_process_json",
        confidence: "medium",
        evidence_refs: evidenceRefs
      })
    };
  }

  return undefined;
}

function claudeTranscriptEntry(record: UnknownRecord): ClaudeTranscriptEntry | undefined {
  const container = transcriptContainer(record);
  const message = messageRecord(container);
  if (message === undefined) {
    return undefined;
  }

  const usageRecord = usageRecordFromMessage(message);
  if (usageRecord === undefined) {
    return undefined;
  }

  const usage = claudeTranscriptTokenUsage(usageRecord);
  if (usage === undefined || usage.totalTokens <= 0) {
    return undefined;
  }

  const messageId = stringValue(message, "id");
  const model = stringValue(message, "model");
  if (messageId === undefined || model === undefined) {
    return undefined;
  }

  return {
    messageId,
    requestId: stringValue(container, "requestId") ?? stringValue(container, "request_id") ?? stringValue(record, "requestId"),
    isSidechain: booleanValue(container, "isSidechain") ?? booleanValue(container, "is_sidechain") ?? false,
    model,
    usage,
    nativeCostUsd: numberValue(container, "costUSD") ?? numberValue(container, "cost_usd") ?? numberValue(record, "costUSD")
  };
}

function transcriptContainer(record: UnknownRecord): UnknownRecord {
  const data = record["data"];
  if (isRecord(data)) {
    const dataMessage = data["message"];
    if (isRecord(dataMessage) && isRecord(dataMessage["message"])) {
      return dataMessage;
    }
  }

  return record;
}

function messageRecord(container: UnknownRecord): UnknownRecord | undefined {
  const message = container["message"];
  if (isRecord(message)) {
    return message;
  }

  return undefined;
}

function usageRecordFromMessage(message: UnknownRecord): UnknownRecord | undefined {
  const usage = message["usage"];
  return isRecord(usage) ? usage : undefined;
}

function usageRecordFromProcess(record: UnknownRecord): UnknownRecord | undefined {
  const candidates: unknown[] = [
    record["usage"],
    nestedRecord(record, ["message", "usage"]),
    nestedRecord(record, ["result", "usage"]),
    nestedRecord(record, ["data", "message", "message", "usage"])
  ];

  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function claudeTranscriptTokenUsage(usage: UnknownRecord): ClaudeTranscriptTokenUsage | undefined {
  const inputTokens = numberValue(usage, "input_tokens") ?? 0;
  const outputTokens = numberValue(usage, "output_tokens") ?? 0;
  const cacheCreation = cacheCreationTokenCount(usage);
  const cacheReadInputTokens = numberValue(usage, "cache_read_input_tokens") ?? 0;
  const totalTokens = inputTokens + outputTokens + cacheCreation.total + cacheReadInputTokens;

  if (totalTokens === 0) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: cacheCreation.total,
    cacheReadInputTokens,
    cacheCreationEphemeral5mInputTokens: cacheCreation.ephemeral5m,
    cacheCreationEphemeral1hInputTokens: cacheCreation.ephemeral1h,
    speed: stringValue(usage, "speed"),
    totalTokens
  };
}

function cacheCreationTokenCount(usage: UnknownRecord): {
  readonly total: number;
  readonly ephemeral5m?: number;
  readonly ephemeral1h?: number;
} {
  const cacheCreation = usage["cache_creation"];
  if (isRecord(cacheCreation)) {
    const ephemeral5m = numberValue(cacheCreation, "ephemeral_5m_input_tokens") ?? 0;
    const ephemeral1h = numberValue(cacheCreation, "ephemeral_1h_input_tokens") ?? 0;
    return {
      total: ephemeral5m + ephemeral1h,
      ephemeral5m,
      ephemeral1h
    };
  }

  return { total: numberValue(usage, "cache_creation_input_tokens") ?? 0 };
}

function dedupeClaudeTranscriptEntries(entries: readonly ClaudeTranscriptEntry[]): ClaudeTranscriptEntry[] {
  const deduped = new Map<string, ClaudeTranscriptEntry>();

  for (const entry of entries) {
    const key = entry.requestId === undefined
      ? entry.messageId
      : `${entry.messageId}:${entry.requestId}`;
    const existing = deduped.get(key);
    if (existing === undefined || shouldReplaceClaudeTranscriptEntry(existing, entry)) {
      deduped.set(key, entry);
    }
  }

  return [...deduped.values()];
}

function shouldReplaceClaudeTranscriptEntry(existing: ClaudeTranscriptEntry, candidate: ClaudeTranscriptEntry): boolean {
  if (existing.isSidechain !== candidate.isSidechain) {
    return existing.isSidechain && !candidate.isSidechain;
  }

  if (existing.usage.totalTokens !== candidate.usage.totalTokens) {
    return candidate.usage.totalTokens > existing.usage.totalTokens;
  }

  return existing.usage.speed === undefined && candidate.usage.speed !== undefined;
}

function claudeTranscriptCost(
  entries: readonly ClaudeTranscriptEntry[],
  evidenceRefs: readonly string[]
): UsageValueObservation {
  const allEntriesHaveNativeCost = entries.every((entry) => entry.nativeCostUsd !== undefined);

  const costs = allEntriesHaveNativeCost
    ? entries.map((entry) => entry.nativeCostUsd as number)
    : entries.map((entry) => calculateClaudeCostUsd(entry.model, entry.usage));
  if (costs.some((cost) => cost === undefined)) {
    return unavailableValue("usd", "claude_transcript_pricing", "no native cost or Claude pricing entry for transcript model");
  }
  const total = (costs as number[]).reduce((sum, cost) => sum + cost, 0);

  return valueObservation({
    value: total,
    unit: "usd",
    measurement_source: allEntriesHaveNativeCost ? "native" : "estimated",
    capture_source: allEntriesHaveNativeCost ? "claude_transcript" : "claude_transcript_pricing",
    confidence: "medium",
    evidence_refs: evidenceRefs
  });
}

function numberValue(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function processCostUsd(record: UnknownRecord): number | undefined {
  return numberValue(record, "total_cost_usd")
    ?? numberValue(record, "cost_usd")
    ?? numberValue(record, "costUSD")
    ?? nestedNumber(record, ["result", "total_cost_usd"])
    ?? nestedNumber(record, ["result", "cost_usd"])
    ?? nestedNumber(record, ["message", "cost_usd"]);
}

function booleanValue(record: UnknownRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function parseClaudeProcessJsonRecords(text: string): UnknownRecord[] {
  const whole = parseJsonRecord(text.trim());
  if (whole !== undefined) {
    return [whole];
  }

  const records: UnknownRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    const record = parseJsonRecord(line.trim());
    if (record !== undefined) {
      records.push(record);
    }
  }

  return records;
}

function parseJsonRecord(text: string): UnknownRecord | undefined {
  if (text.length === 0 || !text.startsWith("{")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function nestedRecord(record: UnknownRecord, keys: readonly string[]): UnknownRecord | undefined {
  let current: unknown = record;

  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }

  return isRecord(current) ? current : undefined;
}
