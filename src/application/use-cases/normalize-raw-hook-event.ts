import type { JsonValue, RawHookEvent } from "../ports/raw-event-store.js";

export interface NormalizedHookEvent {
  schema_version: "bmh.event.v1";
  event_id: string;
  idempotency_key: string;
  provider: RawHookEvent["provider"];
  provider_event_type: string;
  event_type: string;
  occurred_at: string;
  observed_at: string;
  source: {
    transport: "stdin";
    adapter_version: string;
  };
  run: {
    run_id: string;
    trial_id: string;
    session_id?: string;
    turn_id?: string;
  };
  actor: {
    type: "agent";
    name: string;
  };
  action: {
    name?: string;
    category?: string;
    status: string;
  };
  payload: JsonValue;
  raw_ref: {
    raw_event_id: string;
    payload_hash: string;
  };
  quality: {
    identity: "derived";
    timestamp: "native" | "observed";
    ordering: "best_effort";
    payload_completeness: "full";
    session: "native" | "unavailable";
    turn: "native" | "unavailable";
    tool_call: "native" | "unavailable";
    usage: "unavailable";
    context: "native" | "unavailable";
  };
  security: {
    redaction_applied: boolean;
    secret_scan_status: "unknown";
  };
}

export function normalizeRawHookEvent(raw: RawHookEvent): NormalizedHookEvent {
  const payload = asJsonObject(raw.payload);
  const providerEventType = readString(payload, "hook_event_name") ?? "unknown";
  const sessionId = readString(payload, "session_id");
  const turnId = readString(payload, "turn_id");
  const toolName = readString(payload, "tool_name");
  const toolUseId = readString(payload, "tool_use_id");
  const occurredAt = readString(payload, "timestamp") ?? raw.observed_at;

  return {
    schema_version: "bmh.event.v1",
    event_id: `evt_${raw.raw_event_id.slice("raw_".length)}`,
    idempotency_key: [raw.provider, raw.run_id, raw.trial_id, raw.raw_event_id].join(":"),
    provider: raw.provider,
    provider_event_type: providerEventType,
    event_type: toCanonicalEventType(providerEventType, payload),
    occurred_at: occurredAt,
    observed_at: raw.observed_at,
    source: {
      transport: "stdin",
      adapter_version: `${raw.provider.replace("_", "-")}-hooks@0.1.0`
    },
    run: omitUndefined({
      run_id: raw.run_id,
      trial_id: raw.trial_id,
      session_id: sessionId,
      turn_id: turnId
    }),
    actor: {
      type: "agent",
      name: raw.provider
    },
    action: omitUndefined({
      name: toActionName(providerEventType, toolName),
      category: toActionCategory(providerEventType, toolName),
      status: toActionStatus(providerEventType, payload)
    }),
    payload: raw.payload,
    raw_ref: {
      raw_event_id: raw.raw_event_id,
      payload_hash: raw.payload_hash
    },
    quality: {
      identity: "derived",
      timestamp: occurredAt === raw.observed_at ? "observed" : "native",
      ordering: "best_effort",
      payload_completeness: "full",
      session: sessionId === undefined ? "unavailable" : "native",
      turn: turnId === undefined ? "unavailable" : "native",
      tool_call: toolUseId === undefined ? "unavailable" : "native",
      usage: "unavailable",
      context: isCompactEvent(providerEventType) ? "native" : "unavailable"
    },
    security: {
      redaction_applied: false,
      secret_scan_status: "unknown"
    }
  };
}

function toCanonicalEventType(providerEventType: string, payload: Record<string, JsonValue>): string {
  switch (providerEventType) {
    case "SessionStart":
      return "session.started";
    case "UserPromptSubmit":
      return "message.input";
    case "PreToolUse":
      return "tool.requested";
    case "PostToolUse":
      return postToolUseSucceeded(payload) ? "tool.completed" : "tool.failed";
    case "PostToolUseFailure":
      return "tool.failed";
    case "PermissionRequest":
      return "approval.requested";
    case "PreCompact":
    case "PostCompact":
      return "context.compacted";
    case "Stop":
      return "turn.ended";
    case "SessionEnd":
      return "session.ended";
    default:
      return "notification.emitted";
  }
}

function toActionStatus(providerEventType: string, payload: Record<string, JsonValue>): string {
  switch (providerEventType) {
    case "SessionStart":
    case "PreCompact":
      return "started";
    case "UserPromptSubmit":
      return "submitted";
    case "PreToolUse":
    case "PermissionRequest":
      return "requested";
    case "PostToolUse":
      return postToolUseSucceeded(payload) ? "completed" : "failed";
    case "PostToolUseFailure":
      return "failed";
    case "PostCompact":
    case "Stop":
    case "SessionEnd":
      return "completed";
    default:
      return "observed";
  }
}

function toActionName(providerEventType: string, toolName: string | undefined): string | undefined {
  if (providerEventType === "PostToolBatch") {
    return providerEventType;
  }

  return toolName;
}

function toActionCategory(providerEventType: string, toolName: string | undefined): string | undefined {
  switch (providerEventType) {
    case "PermissionRequest":
      return "approval";
    case "PreCompact":
    case "PostCompact":
      return "context";
    case "PostToolBatch":
      return "tool_batch";
    default:
      return toolName === undefined ? undefined : "tool";
  }
}

function postToolUseSucceeded(payload: Record<string, JsonValue>): boolean {
  const response = asJsonObject(payload.tool_response);

  if (typeof response.exit_code === "number") {
    return response.exit_code === 0;
  }

  if (typeof response.success === "boolean") {
    return response.success;
  }

  return true;
}

function isCompactEvent(providerEventType: string): boolean {
  return providerEventType === "PreCompact" || providerEventType === "PostCompact";
}

function asJsonObject(value: JsonValue): Record<string, JsonValue>;
function asJsonObject(value: JsonValue | undefined): Record<string, JsonValue>;
function asJsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return {};
}

function readString(payload: Record<string, JsonValue>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
