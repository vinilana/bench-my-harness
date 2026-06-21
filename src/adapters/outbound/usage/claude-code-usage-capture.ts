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
    const stdout = _context.processStdout !== undefined
      ? textEvidence("process-stdout.txt", _context.processStdout, { parseJsonl: false })
      : await loadTextEvidence(this.#options.processStdoutPath ?? _context.processStdoutPath, { parseJsonl: false });
    const stderr = _context.processStderr !== undefined
      ? textEvidence("process-stderr.txt", _context.processStderr, { parseJsonl: false })
      : await loadTextEvidence(this.#options.processStderrPath ?? _context.processStderrPath, { parseJsonl: false });
    const statusRecords = (statusLine?.records ?? []).map(unwrappedPayloadRecord);
    const hookRecords = (hooks?.records ?? []).map(unwrappedPayloadRecord);
    const transcriptRecords = (transcript?.records ?? []).map(unwrappedPayloadRecord);
    const transcriptEvidenceRef = _context.transcriptEvidenceRef ?? transcript?.file.ref;
    const transcriptUsage = claudeTranscriptUsage(transcriptRecords, transcript, transcriptEvidenceRef);
    void stdout;
    void stderr;

    return usageReport({
      llms: claudeLlms(statusRecords, statusLine, hookRecords, hooks, transcriptRecords, transcript, transcriptUsage, transcriptEvidenceRef),
      tokens: transcriptUsage?.tokens ?? {
        total: claudeTokenTotal(statusRecords, statusLine),
        input: null,
        output: null,
        cache_read: null,
        cache_write: null
      },
      cost: {
        total_usd: transcriptUsage?.cost ?? unavailableValue("usd", "usage_capture", "no native billing or pricing source configured")
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
  statusRecords: readonly UnknownRecord[],
  statusLine: LoadedEvidence | undefined,
  hookRecords: readonly UnknownRecord[],
  hooks: LoadedEvidence | undefined,
  transcriptRecords: readonly UnknownRecord[],
  transcript: LoadedEvidence | undefined,
  transcriptUsage: ClaudeTranscriptUsage | undefined,
  transcriptEvidenceRef: string | undefined
): UsageLlmObservation[] {
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
    if (toolName !== "Task" && toolName !== "Agent") {
      continue;
    }

    const id = stringValue(record, "tool_use_id") ?? stringValue(record, "id");
    if (id === undefined) {
      continue;
    }

    const eventName = stringValue(record, "hook_event_name");
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
  let total = 0;
  let usedEstimatedCost = false;

  for (const entry of entries) {
    if (entry.nativeCostUsd !== undefined) {
      total += entry.nativeCostUsd;
      continue;
    }

    const estimated = calculateClaudeCostUsd(entry.model, entry.usage);
    if (estimated === undefined) {
      return unavailableValue("usd", "claude_transcript_pricing", "no native cost or Claude pricing entry for transcript model");
    }

    total += estimated;
    usedEstimatedCost = true;
  }

  return valueObservation({
    value: total,
    unit: "usd",
    measurement_source: usedEstimatedCost ? "estimated" : "native",
    capture_source: usedEstimatedCost ? "claude_transcript_pricing" : "claude_transcript",
    confidence: "medium",
    evidence_refs: evidenceRefs
  });
}

function numberValue(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(record: UnknownRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
