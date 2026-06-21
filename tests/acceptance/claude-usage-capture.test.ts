import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ClaudeCodeUsageCapture } from "../../src/adapters/outbound/usage/claude-code-usage-capture.js";

const fixtureRoot = resolve(fileURLToPath(new URL("../fixtures/claude-code/usage", import.meta.url)));

describe("Claude Code usage capture", () => {
  test("normalizes model, status-line tokens, subagent usage evidence, skills, MCP usage, and unavailable cost", async () => {
    const usageCapture = new ClaudeCodeUsageCapture({
      hooksJsonlPath: resolve(fixtureRoot, "hooks.jsonl"),
      transcriptJsonlPath: resolve(fixtureRoot, "transcript.jsonl"),
      statusLineJsonlPath: resolve(fixtureRoot, "status-line.jsonl")
    });

    const usage = await usageCapture.captureUsage({
      provider: "claude_code",
      runId: "run_usage_claude",
      trialId: "trial_usage_claude"
    });

    expect(usage.llms).toContainEqual(expect.objectContaining({
      model: "claude-sonnet-4.5",
      provider: "anthropic",
      role: "primary",
      measurement_source: "native",
      capture_source: "claude_status_line_json",
      confidence: "medium",
      evidence_refs: ["status-line.jsonl"]
    }));
    expect(usage.tokens.total).toEqual(expect.objectContaining({
      value: 18420,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "claude_status_line_json",
      confidence: "medium",
      evidence_refs: ["status-line.jsonl"]
    }));
    expect(usage.subagents).toContainEqual(expect.objectContaining({
      id: "agent-1",
      name: "Explore",
      llms: [expect.objectContaining({
        model: "claude-sonnet-4.5",
        role: "subagent",
        measurement_source: "derived",
        capture_source: "hook_events"
      })],
      tokens: {
        total: expect.objectContaining({
          value: 4100,
          unit: "tokens",
          measurement_source: "native",
          capture_source: "hook_events",
          confidence: "medium",
          evidence_refs: ["hooks.jsonl"]
        })
      }
    }));
    expect(usage.skills).toContainEqual(expect.objectContaining({
      name: "tdd",
      source: "claude_code",
      invocation: "explicit",
      measurement_source: "derived",
      capture_source: "transcript",
      confidence: "medium"
    }));
    expect(usage.mcps).toContainEqual(expect.objectContaining({
      server: "filesystem",
      tool: "read_file",
      call_count: 1,
      measurement_source: "derived",
      capture_source: "hook_events",
      confidence: "medium"
    }));
    expect(usage.cost.total_usd).toEqual(expect.objectContaining({
      value: null,
      measurement_source: "unavailable",
      confidence: "none",
      unavailable_reason: "no native billing or pricing source configured"
    }));
    expect(usage.coverage).toEqual({
      model: "available",
      tokens: "partial",
      cost: "unavailable",
      subagents: "partial",
      skills: "partial",
      mcp: "partial"
    });
  });
});
