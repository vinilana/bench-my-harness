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
    void stdout;
    void stderr;

    return usageReport({
      llms: claudeLlms(statusRecords, statusLine, hookRecords, hooks, transcriptRecords, transcript),
      tokens: {
        total: claudeTokenTotal(statusRecords, statusLine),
        input: null,
        output: null,
        cache_read: null,
        cache_write: null
      },
      cost: {
        total_usd: unavailableValue("usd", "usage_capture", "no native billing or pricing source configured")
      },
      subagents: hooks === undefined ? [] : claudeSubagents(hookRecords, hooks),
      skills: transcript === undefined
        ? []
        : collectSkillUsage("claude_code", transcriptRecords, "transcript", transcript.file.ref),
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
  transcript: LoadedEvidence | undefined
): UsageLlmObservation[] {
  const statusModel = firstModel(statusRecords);
  if (statusModel !== undefined && statusLine !== undefined) {
    return [llm(statusModel, "primary", "native", "claude_status_line_json", "medium", statusLine.file.ref)];
  }

  const hookModel = firstModel(hookRecords);
  if (hookModel !== undefined && hooks !== undefined) {
    return [llm(hookModel, "primary", "native", "claude_hook_payload", "high", hooks.file.ref)];
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
      ?? nestedString(record, ["tool_response", "model"]);
    if (model !== undefined) {
      return model;
    }
  }

  return undefined;
}
