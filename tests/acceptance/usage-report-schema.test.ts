import { describe, expect, test } from "vitest";
import { UsageReportSchema } from "../../src/application/ports/usage-capture-port.js";

describe("usage report schema", () => {
  test("accepts source-aware normalized usage observations", () => {
    const report = UsageReportSchema.parse({
      llms: [
        {
          model: "gpt-5.1",
          provider: "openai",
          role: "primary",
          measurement_source: "native",
          capture_source: "codex_hook_payload",
          confidence: "high",
          evidence_refs: ["hooks.jsonl"]
        }
      ],
      tokens: {
        total: {
          value: 259677,
          unit: "tokens",
          measurement_source: "native",
          capture_source: "codex_cli_process_output",
          confidence: "medium",
          evidence_refs: ["process-stderr.txt"]
        },
        input: null,
        output: null,
        cache_read: null,
        cache_write: null
      },
      cost: {
        total_usd: {
          value: null,
          unit: "usd",
          measurement_source: "unavailable",
          capture_source: "usage_capture",
          confidence: "none",
          unavailable_reason: "no native billing or pricing source configured"
        }
      },
      subagents: [],
      skills: [],
      mcps: [],
      coverage: {
        model: "available",
        tokens: "partial",
        cost: "unavailable",
        subagents: "unavailable",
        skills: "unavailable",
        mcp: "unavailable"
      }
    });

    expect(report.tokens.total?.measurement_source).toBe("native");
  });

  test("rejects metric-like usage values without source and confidence", () => {
    const result = UsageReportSchema.safeParse({
      llms: [],
      tokens: {
        total: {
          value: 10,
          unit: "tokens",
          measurement_source: "native",
          confidence: "high"
        },
        input: null,
        output: null,
        cache_read: null,
        cache_write: null
      },
      cost: {
        total_usd: {
          value: null,
          unit: "usd",
          measurement_source: "unavailable",
          capture_source: "usage_capture",
          confidence: "none"
        }
      },
      subagents: [],
      skills: [],
      mcps: [],
      coverage: {
        model: "unavailable",
        tokens: "unavailable",
        cost: "unavailable",
        subagents: "unavailable",
        skills: "unavailable",
        mcp: "unavailable"
      }
    });

    expect(result.success).toBe(false);
  });
});
