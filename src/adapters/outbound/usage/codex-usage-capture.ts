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
  unwrappedPayloadRecord,
  unavailableSubagentUsage,
  unavailableValue,
  usageReport,
  usageToMetricObservations,
  valueObservation
} from "./usage-capture-helpers.js";
import type { LoadedEvidence, UnknownRecord } from "./usage-capture-helpers.js";
import { calculateOpenAiCostUsd } from "./openai-pricing.js";
import type { OpenAiPricingMode, OpenAiPricingTokenUsage } from "./openai-pricing.js";

export interface CodexUsageCaptureOptions {
  readonly hooksJsonlPath?: string;
  readonly transcriptJsonlPath?: string;
  readonly processStdoutPath?: string;
  readonly processStderrPath?: string;
  readonly openAiPricingMode?: OpenAiPricingMode;
}

export class CodexUsageCapture implements NormalizedUsageCapturePort {
  readonly #options: CodexUsageCaptureOptions;

  constructor(options: CodexUsageCaptureOptions) {
    this.#options = options;
  }

  async capture(context: UsageCaptureContext): Promise<readonly MetricObservation[]> {
    const report = await this.captureUsage(context);
    return usageToMetricObservations(context, report);
  }

  async captureUsage(_context: UsageCaptureContext): Promise<UsageReport> {
    const hooks = await loadTextEvidence(this.#options.hooksJsonlPath ?? _context.hookSpoolPath);
    const transcript = await loadTextEvidence(this.#options.transcriptJsonlPath ?? _context.transcriptPath);
    const stdout = _context.processStdout !== undefined
      ? textEvidence("process-stdout.txt", _context.processStdout, { parseJsonl: false })
      : await loadTextEvidence(this.#options.processStdoutPath ?? _context.processStdoutPath, { parseJsonl: false });
    const stderr = _context.processStderr !== undefined
      ? textEvidence("process-stderr.txt", _context.processStderr, { parseJsonl: false })
      : await loadTextEvidence(this.#options.processStderrPath ?? _context.processStderrPath, { parseJsonl: false });
    const processEvidence = stderr ?? stdout;
    const hookRecords = (hooks?.records ?? []).map(unwrappedPayloadRecord);
    const transcriptRecords = (transcript?.records ?? []).map(unwrappedPayloadRecord);
    const transcriptEvidenceRef = _context.transcriptEvidenceRef ?? transcript?.file.ref;
    const sessionUsage = codexSessionUsage(
      transcriptRecords,
      transcript,
      transcriptEvidenceRef,
      this.#options.openAiPricingMode
    );

    return usageReport({
      llms: codexLlms(hookRecords, hooks, sessionUsage, transcriptEvidenceRef),
      tokens: sessionUsage?.tokens ?? {
        total: processEvidence === undefined ? null : codexTokenTotal(processEvidence),
        input: null,
        output: null,
        cache_read: null,
        cache_write: null
      },
      cost: {
        total_usd: sessionUsage?.cost ?? unavailableValue("usd", "usage_capture", "no native billing or pricing source configured")
      },
      subagents: codexSubagents(hookRecords, hooks),
      skills: transcript === undefined || transcriptEvidenceRef === undefined
        ? []
        : collectSkillUsage("codex", transcriptRecords, "transcript", transcriptEvidenceRef),
      mcps: hooks === undefined ? [] : collectMcpUsage(hookRecords, hooks.file.ref)
    });
  }
}

function codexLlms(
  records: readonly UnknownRecord[],
  hooks: LoadedEvidence | undefined,
  sessionUsage: CodexSessionUsage | undefined,
  transcriptEvidenceRef: string | undefined
): UsageLlmObservation[] {
  if (hooks !== undefined) {
    for (const record of records) {
      const model = stringValue(record, "model") ?? nestedString(record, ["message", "model"]);
      if (model !== undefined) {
        return [{
          model,
          provider: modelProvider("codex"),
          role: "primary",
          measurement_source: "native",
          capture_source: "codex_hook_payload",
          confidence: "high",
          evidence_refs: [hooks.file.ref]
        }];
      }
    }
  }

  if (sessionUsage !== undefined && transcriptEvidenceRef !== undefined && sessionUsage.model !== undefined) {
    return [{
      model: sessionUsage.model,
      provider: modelProvider("codex"),
      role: "primary",
      measurement_source: "native",
      capture_source: "codex_session_transcript",
      confidence: "medium",
      evidence_refs: [transcriptEvidenceRef]
    }];
  }

  return [];
}

function codexTokenTotal(evidence: LoadedEvidence) {
  const value = parseCodexTotalTokens(evidence.text);

  if (value === undefined) {
    return unavailableValue("tokens", "codex_cli_process_output", "codex process output did not include total token usage");
  }

  return valueObservation({
    value,
    unit: "tokens",
    measurement_source: "native",
    capture_source: "codex_cli_process_output",
    confidence: "medium",
    evidence_refs: [evidence.file.ref]
  });
}

function parseCodexTotalTokens(text: string): number | undefined {
  const patterns = [
    /total\s+tokens?\s*:\s*([\d,]+)/i,
    /token\s+usage[^\d]+([\d,]+)\s+total/i,
    /([\d,]+)\s+total\s+tokens?/i,
    /tokens?\s+used\s*\r?\n\s*([\d,]+)/i,
    /tokens?\s+used[^\d]+([\d,]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const rawValue = match?.[1];
    if (rawValue !== undefined) {
      return Number(rawValue.replace(/,/g, ""));
    }
  }

  return undefined;
}

function codexSubagents(records: readonly UnknownRecord[], hooks: LoadedEvidence | undefined) {
  if (hooks === undefined) {
    return [];
  }

  const subagents = new Map<string, {
    name?: string;
    started_at?: string;
    ended_at?: string;
  }>();

  for (const record of records) {
    const eventName = stringValue(record, "hook_event_name");
    if (eventName !== "SubagentStart" && eventName !== "SubagentStop") {
      continue;
    }

    const id = stringValue(record, "subagent_id") ?? stringValue(record, "id");
    if (id === undefined) {
      continue;
    }

    const current = subagents.get(id) ?? {};
    const updated = {
      ...current,
      name: stringValue(record, "subagent_name") ?? current.name,
      started_at: eventName === "SubagentStart" ? stringValue(record, "occurred_at") : current.started_at,
      ended_at: eventName === "SubagentStop" ? stringValue(record, "occurred_at") : current.ended_at
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

interface CodexSessionUsage {
  readonly model?: string;
  readonly tokens: {
    readonly total: UsageValueObservation;
    readonly input: UsageValueObservation;
    readonly output: UsageValueObservation;
    readonly cache_read: UsageValueObservation;
    readonly cache_write: UsageValueObservation;
  };
  readonly cost: UsageValueObservation;
}

interface CodexTokenUsage extends OpenAiPricingTokenUsage {
  readonly totalTokens: number;
  readonly reasoningOutputTokens: number;
}

function codexSessionUsage(
  records: readonly UnknownRecord[],
  transcript: LoadedEvidence | undefined,
  transcriptEvidenceRef: string | undefined,
  openAiPricingMode: OpenAiPricingMode | undefined
): CodexSessionUsage | undefined {
  if (transcript === undefined || transcriptEvidenceRef === undefined) {
    return undefined;
  }

  const tokenUsage = finalCodexTokenUsage(records);
  if (tokenUsage === undefined) {
    return undefined;
  }

  const model = firstCodexSessionModel(records);
  const evidenceRefs = [transcriptEvidenceRef];
  const token = (value: number) => valueObservation({
    value,
    unit: "tokens",
    measurement_source: "native",
    capture_source: "codex_session_transcript",
    confidence: "medium",
    evidence_refs: evidenceRefs
  });

  return {
    model,
    tokens: {
      total: token(tokenUsage.totalTokens),
      input: token(tokenUsage.inputTokens),
      output: token(tokenUsage.outputTokens),
      cache_read: token(tokenUsage.cachedInputTokens),
      cache_write: unavailableValue(
        "tokens",
        "codex_session_transcript",
        "codex session transcript did not expose cache write usage"
      )
    },
    cost: codexSessionCost(model, tokenUsage, evidenceRefs, openAiPricingMode)
  };
}

function finalCodexTokenUsage(records: readonly UnknownRecord[]): CodexTokenUsage | undefined {
  let selected: CodexTokenUsage | undefined;

  for (const record of records) {
    const usage = codexTokenUsageFromRecord(record);
    if (usage === undefined) {
      continue;
    }

    if (selected === undefined || usage.totalTokens >= selected.totalTokens) {
      selected = usage;
    }
  }

  return selected;
}

function codexTokenUsageFromRecord(record: UnknownRecord): CodexTokenUsage | undefined {
  const payload = payloadRecord(record);
  if (stringValue(payload, "type") !== "token_count") {
    return undefined;
  }

  const inputTokens = nestedNumber(payload, ["info", "total_token_usage", "input_tokens"]);
  const outputTokens = nestedNumber(payload, ["info", "total_token_usage", "output_tokens"]);
  const totalTokens = nestedNumber(payload, ["info", "total_token_usage", "total_tokens"]);
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: nestedNumber(payload, ["info", "total_token_usage", "cached_input_tokens"]) ?? 0,
    reasoningOutputTokens: nestedNumber(payload, ["info", "total_token_usage", "reasoning_output_tokens"]) ?? 0,
    totalTokens
  };
}

function firstCodexSessionModel(records: readonly UnknownRecord[]): string | undefined {
  for (const record of records) {
    const payload = payloadRecord(record);
    const model = stringValue(payload, "model")
      ?? nestedString(payload, ["info", "model"])
      ?? stringValue(record, "model");
    if (model !== undefined) {
      return model;
    }
  }

  return undefined;
}

function codexSessionCost(
  model: string | undefined,
  usage: CodexTokenUsage,
  evidenceRefs: readonly string[],
  openAiPricingMode: OpenAiPricingMode | undefined
): UsageValueObservation {
  const estimated = calculateOpenAiCostUsd(model, usage, { mode: openAiPricingMode });
  if (estimated === undefined) {
    return unavailableValue("usd", "codex_session_transcript_pricing", "no native cost or OpenAI pricing entry for transcript model");
  }

  return valueObservation({
    value: estimated,
    unit: "usd",
    measurement_source: "estimated",
    capture_source: "codex_session_transcript_pricing",
    confidence: "medium",
    evidence_refs: evidenceRefs
  });
}

function payloadRecord(record: UnknownRecord): UnknownRecord {
  const payload = record["payload"];
  return isRecord(payload) ? payload : record;
}
