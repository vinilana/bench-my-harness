import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { CodexUsageCapture } from "../../src/adapters/outbound/usage/codex-usage-capture.js";

const fixtureRoot = resolve(fileURLToPath(new URL("../fixtures/codex/usage", import.meta.url)));

describe("Codex usage capture", () => {
  test("normalizes model, process token summary, subagents, skills, MCP usage, and unavailable cost", async () => {
    const usageCapture = new CodexUsageCapture({
      hooksJsonlPath: resolve(fixtureRoot, "hooks.jsonl"),
      transcriptJsonlPath: resolve(fixtureRoot, "transcript.jsonl"),
      processStderrPath: resolve(fixtureRoot, "process-stderr.txt")
    });

    const usage = await usageCapture.captureUsage({
      provider: "codex",
      runId: "run_usage_codex",
      trialId: "trial_usage_codex"
    });

    expect(usage.llms).toContainEqual(expect.objectContaining({
      model: "gpt-5.1",
      provider: "openai",
      role: "primary",
      measurement_source: "native",
      capture_source: "codex_hook_payload",
      confidence: "high",
      evidence_refs: ["hooks.jsonl"]
    }));
    expect(usage.tokens.total).toEqual(expect.objectContaining({
      value: 259677,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "codex_cli_process_output",
      confidence: "medium",
      evidence_refs: ["process-stderr.txt"]
    }));
    expect(usage.subagents).toContainEqual(expect.objectContaining({
      id: "subagent_1",
      name: "Explore",
      started_at: "2026-06-21T02:10:00.000Z",
      ended_at: "2026-06-21T02:11:00.000Z",
      tokens: {
        total: expect.objectContaining({
          value: null,
          measurement_source: "unavailable",
          capture_source: "subagent_usage_capture",
          confidence: "none",
          unavailable_reason: "provider did not expose per-subagent usage"
        })
      }
    }));
    expect(usage.skills).toContainEqual(expect.objectContaining({
      name: "code-review",
      source: "codex",
      invocation: "explicit",
      measurement_source: "derived",
      capture_source: "transcript",
      confidence: "medium",
      evidence_refs: ["transcript.jsonl"]
    }));
    expect(usage.mcps).toContainEqual(expect.objectContaining({
      server: "github",
      tool: "pull_request_read",
      call_count: 1,
      measurement_source: "derived",
      capture_source: "hook_events",
      confidence: "medium",
      evidence_refs: ["hooks.jsonl"]
    }));
    expect(usage.cost.total_usd).toEqual(expect.objectContaining({
      value: null,
      unit: "usd",
      measurement_source: "unavailable",
      capture_source: "usage_capture",
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

  test("aggregates Codex session transcript token counts, cached tokens, model, and pricing fallback", async () => {
    const usageCapture = new CodexUsageCapture({
      transcriptJsonlPath: resolve(fixtureRoot, "codex-session-transcript.jsonl")
    });

    const usage = await usageCapture.captureUsage({
      provider: "codex",
      runId: "run_usage_codex_transcript",
      trialId: "trial_usage_codex_transcript"
    });

    expect(usage.llms).toEqual([expect.objectContaining({
      model: "gpt-5.3-codex",
      provider: "openai",
      role: "primary",
      measurement_source: "native",
      capture_source: "codex_session_transcript",
      confidence: "medium",
      evidence_refs: ["codex-session-transcript.jsonl"]
    })]);
    expect(usage.tokens.total).toEqual(expect.objectContaining({
      value: 10500,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "codex_session_transcript",
      confidence: "medium",
      evidence_refs: ["codex-session-transcript.jsonl"]
    }));
    expect(usage.tokens.input).toEqual(expect.objectContaining({ value: 10000 }));
    expect(usage.tokens.output).toEqual(expect.objectContaining({ value: 500 }));
    expect(usage.tokens.cache_read).toEqual(expect.objectContaining({ value: 4000 }));
    expect(usage.tokens.cache_write).toEqual(expect.objectContaining({
      value: null,
      measurement_source: "unavailable",
      capture_source: "codex_session_transcript",
      unavailable_reason: "codex session transcript did not expose cache write usage"
    }));
    expect(usage.cost.total_usd.value).toBeCloseTo(0.0182, 12);
    expect(usage.cost.total_usd).toEqual(expect.objectContaining({
      unit: "usd",
      measurement_source: "estimated",
      capture_source: "codex_session_transcript_pricing",
      confidence: "medium",
      evidence_refs: ["codex-session-transcript.jsonl"]
    }));
    expect(usage.coverage.tokens).toBe("partial");
    expect(usage.coverage.cost).toBe("available");

    const metrics = await usageCapture.capture({
      provider: "codex",
      runId: "run_usage_codex_transcript",
      trialId: "trial_usage_codex_transcript"
    });
    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metric: "input_tokens",
        value: 10000,
        run_id: "run_usage_codex_transcript",
        trial_id: "trial_usage_codex_transcript",
        provider: "codex"
      }),
      expect.objectContaining({
        metric: "output_tokens",
        value: 500,
        run_id: "run_usage_codex_transcript",
        trial_id: "trial_usage_codex_transcript",
        provider: "codex"
      })
    ]));
  });

  test("uses explicit priority pricing mode for Codex estimates", async () => {
    const usageCapture = new CodexUsageCapture({
      transcriptJsonlPath: resolve(fixtureRoot, "codex-session-transcript.jsonl"),
      openAiPricingMode: "priority"
    });

    const usage = await usageCapture.captureUsage({
      provider: "codex",
      runId: "run_usage_codex_transcript_priority",
      trialId: "trial_usage_codex_transcript_priority"
    });

    expect(usage.cost.total_usd.value).toBeCloseTo(0.0364, 12);
    expect(usage.cost.total_usd).toEqual(expect.objectContaining({
      unit: "usd",
      measurement_source: "estimated",
      capture_source: "codex_session_transcript_pricing",
      confidence: "medium",
      evidence_refs: ["codex-session-transcript.jsonl"]
    }));
  });
});
