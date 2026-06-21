import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  MetricObservation,
  MeasurementConfidence,
  MeasurementSource,
  UsageCaptureContext,
  UsageCoverageStatus,
  UsageLlmObservation,
  UsageMcpObservation,
  UsageReport,
  UsageSkillObservation,
  UsageSubagentObservation,
  UsageValueObservation
} from "../../../application/ports/usage-capture-port.js";
import { UsageReportSchema } from "../../../application/ports/usage-capture-port.js";

export interface EvidenceFile {
  readonly path: string;
  readonly ref: string;
}

export interface LoadedEvidence {
  readonly file: EvidenceFile;
  readonly text: string;
  readonly records: readonly UnknownRecord[];
}

export type UnknownRecord = Record<string, unknown>;

export function evidenceFile(path: string): EvidenceFile {
  return { path, ref: basename(path) };
}

export function textEvidence(path: string, text: string, options: { readonly parseJsonl?: boolean } = {}): LoadedEvidence {
  const file = evidenceFile(path);
  const records = options.parseJsonl === false ? [] : parseJsonl(text);
  return { file, text, records };
}

export async function loadTextEvidence(
  path: string | undefined,
  options: { readonly parseJsonl?: boolean } = {}
): Promise<LoadedEvidence | undefined> {
  if (path === undefined) {
    return undefined;
  }

  const file = evidenceFile(path);
  let text: string;

  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }

  const records = options.parseJsonl === false ? [] : parseJsonl(text);
  return { file, text, records };
}

export function parseJsonl(text: string): UnknownRecord[] {
  const records: UnknownRecord[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const parsed = JSON.parse(trimmed) as unknown;
    if (isRecord(parsed)) {
      records.push(parsed);
    }
  }

  return records;
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unwrappedPayloadRecord(record: UnknownRecord): UnknownRecord {
  const payload = record["payload"];

  if (!isRecord(payload)) {
    return record;
  }

  return {
    ...record,
    ...payload
  };
}

export function stringValue(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function nestedString(record: UnknownRecord, keys: readonly string[]): string | undefined {
  let current: unknown = record;

  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }

  return typeof current === "string" && current.length > 0 ? current : undefined;
}

export function nestedNumber(record: UnknownRecord, keys: readonly string[]): number | undefined {
  let current: unknown = record;

  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }

  return typeof current === "number" && Number.isFinite(current) ? current : undefined;
}

export function tokenTotalFromUsage(record: UnknownRecord): number | undefined {
  const total = nestedNumber(record, ["usage", "total_tokens"])
    ?? nestedNumber(record, ["tool_response", "usage", "total_tokens"])
    ?? nestedNumber(record, ["tokens", "total"])
    ?? nestedNumber(record, ["message", "usage", "total_tokens"]);
  if (total !== undefined) {
    return total;
  }

  const input = nestedNumber(record, ["usage", "input_tokens"])
    ?? nestedNumber(record, ["message", "usage", "input_tokens"]);
  const output = nestedNumber(record, ["usage", "output_tokens"])
    ?? nestedNumber(record, ["message", "usage", "output_tokens"]);

  if (input !== undefined || output !== undefined) {
    return (input ?? 0) + (output ?? 0);
  }

  return undefined;
}

export function unavailableValue(unit: string, captureSource: string, unavailableReason: string): UsageValueObservation {
  return {
    value: null,
    unit,
    measurement_source: "unavailable",
    capture_source: captureSource,
    confidence: "none",
    unavailable_reason: unavailableReason
  };
}

export function valueObservation(input: {
  readonly value: number;
  readonly unit: string;
  readonly measurement_source: MeasurementSource;
  readonly capture_source: string;
  readonly confidence: MeasurementConfidence;
  readonly evidence_refs?: readonly string[];
}): UsageValueObservation {
  return {
    value: input.value,
    unit: input.unit,
    measurement_source: input.measurement_source,
    capture_source: input.capture_source,
    confidence: input.confidence,
    evidence_refs: input.evidence_refs === undefined ? undefined : [...input.evidence_refs]
  };
}

export function usageReport(input: Omit<UsageReport, "coverage">): UsageReport {
  return UsageReportSchema.parse({
    ...input,
    coverage: coverageFor(input)
  });
}

export function usageToMetricObservations(context: UsageCaptureContext, report: UsageReport): MetricObservation[] {
  void context;
  const metrics: MetricObservation[] = [];

  if (report.tokens.total !== null) {
    metrics.push({
      metric: "total_tokens",
      value: report.tokens.total.value,
      unit: report.tokens.total.unit,
      measurement_source: report.tokens.total.measurement_source,
      capture_source: report.tokens.total.capture_source,
      confidence: report.tokens.total.confidence
    });
  }

  metrics.push({
    metric: "cost_usd",
    value: report.cost.total_usd.value,
    unit: report.cost.total_usd.unit,
    measurement_source: report.cost.total_usd.measurement_source,
    capture_source: report.cost.total_usd.capture_source,
    confidence: report.cost.total_usd.confidence
  });

  return metrics;
}

export function modelProvider(provider: "codex" | "claude_code"): string {
  return provider === "codex" ? "openai" : "anthropic";
}

export function extractMcpToolName(toolName: string | undefined): { server: string; tool: string } | undefined {
  if (toolName === undefined || !toolName.startsWith("mcp__")) {
    return undefined;
  }

  const [, server, ...toolParts] = toolName.split("__");
  if (server === undefined || toolParts.length === 0) {
    return undefined;
  }

  const tool = toolParts.join("__");
  return tool.length > 0 ? { server, tool } : undefined;
}

export function collectMcpUsage(records: readonly UnknownRecord[], evidenceRef: string): UsageMcpObservation[] {
  const counts = new Map<string, { server: string; tool: string; call_count: number }>();

  for (const record of records) {
    const mcp = extractMcpToolName(stringValue(record, "tool_name") ?? stringValue(record, "name"));
    if (mcp === undefined) {
      continue;
    }

    const key = `${mcp.server}:${mcp.tool}`;
    const existing = counts.get(key) ?? { ...mcp, call_count: 0 };
    existing.call_count += 1;
    counts.set(key, existing);
  }

  return [...counts.values()].map((mcp) => ({
    ...mcp,
    measurement_source: "derived",
    capture_source: "hook_events",
    confidence: "medium",
    evidence_refs: [evidenceRef]
  }));
}

export function collectSkillUsage(
  provider: "codex" | "claude_code",
  records: readonly UnknownRecord[],
  captureSource: string,
  evidenceRef: string
): UsageSkillObservation[] {
  const skills = new Map<string, UsageSkillObservation>();

  for (const record of records) {
    const candidates = skillNamesFromRecord(record);
    for (const name of candidates) {
      skills.set(name, {
        name,
        source: provider,
        invocation: skillInvocation(record),
        measurement_source: "derived",
        capture_source: captureSource,
        confidence: "medium",
        evidence_refs: [evidenceRef]
      });
    }
  }

  return [...skills.values()];
}

export function unavailableSubagentUsage(id: string, fields: {
  readonly name?: string;
  readonly started_at?: string;
  readonly ended_at?: string;
  readonly evidence_refs: readonly string[];
  readonly llms?: readonly UsageLlmObservation[];
  readonly tokensTotal?: UsageValueObservation;
}): UsageSubagentObservation {
  return {
    id,
    name: fields.name,
    started_at: fields.started_at,
    ended_at: fields.ended_at,
    llms: fields.llms === undefined ? [] : [...fields.llms],
    tokens: {
      total: fields.tokensTotal ?? unavailableValue(
        "tokens",
        "subagent_usage_capture",
        "provider did not expose per-subagent usage"
      )
    },
    cost: {
      total_usd: unavailableValue("usd", "subagent_usage_capture", "provider did not expose per-subagent cost")
    },
    evidence_refs: [...fields.evidence_refs]
  };
}

function skillNamesFromRecord(record: UnknownRecord): string[] {
  const names = new Set<string>();
  const direct = stringValue(record, "skill_name") ?? stringValue(record, "skill");
  if (direct !== undefined) {
    names.add(direct);
  }

  const skills = record["skills"];
  if (Array.isArray(skills)) {
    for (const skill of skills) {
      if (typeof skill === "string" && skill.length > 0) {
        names.add(skill);
      }
      if (isRecord(skill)) {
        const name = stringValue(skill, "name") ?? stringValue(skill, "skill_name");
        if (name !== undefined) {
          names.add(name);
        }
      }
    }
  }

  return [...names];
}

function skillInvocation(record: UnknownRecord): "explicit" | "implicit" | "unknown" {
  const invocation = stringValue(record, "invocation");
  if (invocation === "explicit" || invocation === "implicit") {
    return invocation;
  }

  return "unknown";
}

function coverageFor(input: Omit<UsageReport, "coverage">): UsageReport["coverage"] {
  return {
    model: input.llms.length > 0 ? "available" : "unavailable",
    tokens: tokenCoverage(input.tokens),
    cost: input.cost.total_usd.value === null ? "unavailable" : "available",
    subagents: input.subagents.length > 0 ? "partial" : "unavailable",
    skills: input.skills.length > 0 ? "partial" : "unavailable",
    mcp: input.mcps.length > 0 ? "partial" : "unavailable"
  };
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function tokenCoverage(tokens: Omit<UsageReport["tokens"], never>): UsageCoverageStatus {
  if (tokens.total === null || tokens.total.value === null) {
    return "unavailable";
  }

  return tokens.input === null || tokens.output === null || tokens.cache_read === null || tokens.cache_write === null
    ? "partial"
    : "available";
}
