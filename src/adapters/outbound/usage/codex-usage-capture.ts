import type {
  MetricObservation,
  NormalizedUsageCapturePort,
  UsageCaptureContext,
  UsageLlmObservation,
  UsageReport
} from "../../../application/ports/usage-capture-port.js";
import {
  collectMcpUsage,
  collectSkillUsage,
  loadTextEvidence,
  modelProvider,
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

export interface CodexUsageCaptureOptions {
  readonly hooksJsonlPath?: string;
  readonly transcriptJsonlPath?: string;
  readonly processStdoutPath?: string;
  readonly processStderrPath?: string;
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

    return usageReport({
      llms: codexLlms(hookRecords, hooks),
      tokens: {
        total: processEvidence === undefined ? null : codexTokenTotal(processEvidence),
        input: null,
        output: null,
        cache_read: null,
        cache_write: null
      },
      cost: {
        total_usd: unavailableValue("usd", "usage_capture", "no native billing or pricing source configured")
      },
      subagents: codexSubagents(hookRecords, hooks),
      skills: transcript === undefined ? [] : collectSkillUsage("codex", transcriptRecords, "transcript", transcript.file.ref),
      mcps: hooks === undefined ? [] : collectMcpUsage(hookRecords, hooks.file.ref)
    });
  }
}

function codexLlms(records: readonly UnknownRecord[], hooks: LoadedEvidence | undefined): UsageLlmObservation[] {
  if (hooks === undefined) {
    return [];
  }

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
