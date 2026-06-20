import { describe, expect, test } from "vitest";

import { normalizeRawHookEvent } from "../../src/application/use-cases/normalize-raw-hook-event.js";
import type { JsonValue, RawHookEvent } from "../../src/application/ports/raw-event-store.js";
import { NormalizedEventSchema } from "../../src/domain/events/normalized-event.js";

import claudePermissionRequest from "../fixtures/claude-code/permission-request.json" with { type: "json" };
import claudePostCompact from "../fixtures/claude-code/post-compact.json" with { type: "json" };
import claudePostToolBatch from "../fixtures/claude-code/post-tool-batch.json" with { type: "json" };
import claudePostToolUse from "../fixtures/claude-code/post-tool-use.json" with { type: "json" };
import claudePostToolUseFailure from "../fixtures/claude-code/post-tool-use-failure.json" with { type: "json" };
import claudePreCompact from "../fixtures/claude-code/pre-compact.json" with { type: "json" };
import claudePreToolUse from "../fixtures/claude-code/pre-tool-use.json" with { type: "json" };
import claudeSessionEnd from "../fixtures/claude-code/session-end.json" with { type: "json" };
import claudeSessionStart from "../fixtures/claude-code/session-start.json" with { type: "json" };
import claudeStop from "../fixtures/claude-code/stop.json" with { type: "json" };
import claudeUserPromptSubmit from "../fixtures/claude-code/user-prompt-submit.json" with { type: "json" };
import codexPermissionRequest from "../fixtures/codex/permission-request.json" with { type: "json" };
import codexPostCompact from "../fixtures/codex/post-compact.json" with { type: "json" };
import codexPostToolUse from "../fixtures/codex/post-tool-use.json" with { type: "json" };
import codexPreCompact from "../fixtures/codex/pre-compact.json" with { type: "json" };
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };
import codexSessionStart from "../fixtures/codex/session-start.json" with { type: "json" };
import codexStop from "../fixtures/codex/stop.json" with { type: "json" };
import codexUserPromptSubmit from "../fixtures/codex/user-prompt-submit.json" with { type: "json" };

describe("normalization coverage", () => {
  test.each([
    {
      name: "Codex SessionStart",
      provider: "codex",
      payload: codexSessionStart,
      eventType: "session.started",
      status: "started"
    },
    {
      name: "Codex UserPromptSubmit",
      provider: "codex",
      payload: codexUserPromptSubmit,
      eventType: "message.input",
      status: "submitted"
    },
    {
      name: "Codex PreToolUse",
      provider: "codex",
      payload: codexPreToolUse,
      eventType: "tool.requested",
      status: "requested",
      actionName: "Bash",
      category: "tool"
    },
    {
      name: "Codex PostToolUse success",
      provider: "codex",
      payload: codexPostToolUse,
      eventType: "tool.completed",
      status: "completed",
      actionName: "Bash",
      category: "tool"
    },
    {
      name: "Codex PostToolUse failure",
      provider: "codex",
      payload: { ...codexPostToolUse, tool_response: { exit_code: 1, stderr: "failed" } },
      eventType: "tool.failed",
      status: "failed",
      actionName: "Bash",
      category: "tool"
    },
    {
      name: "Codex PermissionRequest",
      provider: "codex",
      payload: codexPermissionRequest,
      eventType: "approval.requested",
      status: "requested",
      actionName: "Bash",
      category: "approval"
    },
    {
      name: "Codex PreCompact",
      provider: "codex",
      payload: codexPreCompact,
      eventType: "context.compacted",
      status: "started",
      category: "context"
    },
    {
      name: "Codex PostCompact",
      provider: "codex",
      payload: codexPostCompact,
      eventType: "context.compacted",
      status: "completed",
      category: "context"
    },
    {
      name: "Codex Stop",
      provider: "codex",
      payload: codexStop,
      eventType: "turn.ended",
      status: "completed"
    },
    {
      name: "Claude Code SessionStart",
      provider: "claude_code",
      payload: claudeSessionStart,
      eventType: "session.started",
      status: "started"
    },
    {
      name: "Claude Code UserPromptSubmit",
      provider: "claude_code",
      payload: claudeUserPromptSubmit,
      eventType: "message.input",
      status: "submitted"
    },
    {
      name: "Claude Code PreToolUse",
      provider: "claude_code",
      payload: claudePreToolUse,
      eventType: "tool.requested",
      status: "requested",
      actionName: "Bash",
      category: "tool"
    },
    {
      name: "Claude Code PostToolUse success",
      provider: "claude_code",
      payload: claudePostToolUse,
      eventType: "tool.completed",
      status: "completed",
      actionName: "Bash",
      category: "tool"
    },
    {
      name: "Claude Code PostToolUse failure",
      provider: "claude_code",
      payload: { ...claudePostToolUse, tool_response: { success: false, stderr: "failed" } },
      eventType: "tool.failed",
      status: "failed",
      actionName: "Bash",
      category: "tool"
    },
    {
      name: "Claude Code PermissionRequest",
      provider: "claude_code",
      payload: claudePermissionRequest,
      eventType: "approval.requested",
      status: "requested",
      actionName: "Bash",
      category: "approval"
    },
    {
      name: "Claude Code PreCompact",
      provider: "claude_code",
      payload: claudePreCompact,
      eventType: "context.compacted",
      status: "started",
      category: "context"
    },
    {
      name: "Claude Code PostCompact",
      provider: "claude_code",
      payload: claudePostCompact,
      eventType: "context.compacted",
      status: "completed",
      category: "context"
    },
    {
      name: "Claude Code Stop",
      provider: "claude_code",
      payload: claudeStop,
      eventType: "turn.ended",
      status: "completed"
    },
    {
      name: "Claude Code SessionEnd",
      provider: "claude_code",
      payload: claudeSessionEnd,
      eventType: "session.ended",
      status: "completed"
    },
    {
      name: "Claude Code PostToolUseFailure",
      provider: "claude_code",
      payload: claudePostToolUseFailure,
      eventType: "tool.failed",
      status: "failed",
      actionName: "Bash",
      category: "tool"
    },
    {
      name: "Claude Code PostToolBatch",
      provider: "claude_code",
      payload: claudePostToolBatch,
      eventType: "notification.emitted",
      status: "observed",
      actionName: "PostToolBatch",
      category: "tool_batch"
    }
  ] as const)("maps $name to a canonical event", ({ provider, payload, eventType, status, actionName, category }) => {
    const raw = rawHookEvent(provider, payload as unknown as JsonValue);
    const normalized = NormalizedEventSchema.parse(normalizeRawHookEvent(raw));

    expect(normalized.provider).toBe(provider);
    expect(normalized.provider_event_type).toBe(payload.hook_event_name);
    expect(normalized.event_type).toBe(eventType);
    expect(normalized.action.status).toBe(status);
    expect(normalized.action.name).toBe(actionName);
    expect(normalized.action.category).toBe(category);
    expect(normalized.raw_ref).toEqual({
      raw_event_id: raw.raw_event_id,
      payload_hash: raw.payload_hash
    });
  });

  test("marks unavailable and derived fields explicitly instead of inventing hook data", () => {
    const raw = rawHookEvent("claude_code", claudeUserPromptSubmit);
    const normalized = NormalizedEventSchema.parse(normalizeRawHookEvent(raw));

    expect(normalized.event_id).toBe("evt_1");
    expect(normalized.run.turn_id).toBeUndefined();
    expect(normalized.quality).toMatchObject({
      identity: "derived",
      timestamp: "observed",
      ordering: "best_effort",
      payload_completeness: "full",
      session: "native",
      turn: "unavailable",
      tool_call: "unavailable",
      usage: "unavailable",
      context: "unavailable"
    });
  });
});

function rawHookEvent(provider: "codex" | "claude_code", payload: JsonValue): RawHookEvent {
  return {
    raw_event_id: "raw_1",
    provider,
    run_id: "run_1",
    trial_id: "trial_1",
    payload,
    payload_hash: "sha256:payload",
    observed_at: "2026-06-20T12:00:00.000Z",
    duplicate_count: 0
  };
}
