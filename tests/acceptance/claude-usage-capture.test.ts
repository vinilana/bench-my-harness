import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  test("aggregates Claude Code transcript usage with dedupe, cache tokens, and consistent pricing fallback", async () => {
    const usageCapture = new ClaudeCodeUsageCapture({
      transcriptJsonlPath: resolve(fixtureRoot, "claude-session-transcript.jsonl")
    });

    const usage = await usageCapture.captureUsage({
      provider: "claude_code",
      runId: "run_usage_claude_transcript",
      trialId: "trial_usage_claude_transcript"
    });

    expect(usage.llms).toEqual([expect.objectContaining({
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      role: "primary",
      measurement_source: "native",
      capture_source: "claude_transcript",
      confidence: "medium",
      evidence_refs: ["claude-session-transcript.jsonl"]
    })]);
    expect(usage.tokens.total).toEqual(expect.objectContaining({
      value: 2375,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "claude_transcript",
      confidence: "medium",
      evidence_refs: ["claude-session-transcript.jsonl"]
    }));
    expect(usage.tokens.input).toEqual(expect.objectContaining({ value: 1500 }));
    expect(usage.tokens.output).toEqual(expect.objectContaining({ value: 250 }));
    expect(usage.tokens.cache_write).toEqual(expect.objectContaining({ value: 125 }));
    expect(usage.tokens.cache_read).toEqual(expect.objectContaining({ value: 500 }));
    expect(usage.cost.total_usd.value).toBeCloseTo(0.00888, 12);
    expect(usage.cost.total_usd.value).not.toBeCloseTo(0.022415, 12);
    expect(usage.cost.total_usd).toEqual(expect.objectContaining({
      unit: "usd",
      measurement_source: "estimated",
      capture_source: "claude_transcript_pricing",
      confidence: "medium",
      evidence_refs: ["claude-session-transcript.jsonl"]
    }));
    expect(usage.coverage.tokens).toBe("available");
    expect(usage.coverage.cost).toBe("available");
  });

  test("extracts model, tokens, and native cost from Claude process JSON output", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-claude-process-json-"));
    const stdoutPath = join(root, "process-stdout.txt");
    await writeFile(
      stdoutPath,
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        model: "claude-sonnet-4-6",
        total_cost_usd: 0.0123,
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 70
        }
      })}\n`,
      "utf8"
    );

    const usageCapture = new ClaudeCodeUsageCapture({
      processStdoutPath: stdoutPath
    });

    const usage = await usageCapture.captureUsage({
      provider: "claude_code",
      runId: "run_usage_claude_process",
      trialId: "trial_usage_claude_process"
    });

    expect(usage.llms).toEqual([expect.objectContaining({
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      role: "primary",
      measurement_source: "native",
      capture_source: "claude_cli_process_json",
      confidence: "medium",
      evidence_refs: ["process-stdout.txt"]
    })]);
    expect(usage.tokens.total).toEqual(expect.objectContaining({
      value: 1300,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "claude_cli_process_json",
      confidence: "medium",
      evidence_refs: ["process-stdout.txt"]
    }));
    expect(usage.tokens.input).toEqual(expect.objectContaining({ value: 1000 }));
    expect(usage.tokens.output).toEqual(expect.objectContaining({ value: 200 }));
    expect(usage.tokens.cache_write).toEqual(expect.objectContaining({ value: 30 }));
    expect(usage.tokens.cache_read).toEqual(expect.objectContaining({ value: 70 }));
    expect(usage.cost.total_usd).toEqual(expect.objectContaining({
      value: 0.0123,
      unit: "usd",
      measurement_source: "native",
      capture_source: "claude_cli_process_json",
      confidence: "medium",
      evidence_refs: ["process-stdout.txt"]
    }));
    expect(usage.coverage).toEqual(expect.objectContaining({
      model: "available",
      tokens: "available",
      cost: "available"
    }));
  });

  test("extracts input, output, cache tokens, and native cost from Claude status-line JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-claude-status-json-"));
    const statusLinePath = join(root, "status-line.jsonl");
    await writeFile(
      statusLinePath,
      `${JSON.stringify({
        session_id: "claude-session-status-usage",
        model: "claude-sonnet-4-6",
        total_cost_usd: 0.0123,
        usage: {
          total_tokens: 1325,
          input_tokens: 1000,
          output_tokens: 200,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 75
        }
      })}\n`,
      "utf8"
    );

    const usageCapture = new ClaudeCodeUsageCapture({
      statusLineJsonlPath: statusLinePath
    });

    const usage = await usageCapture.captureUsage({
      provider: "claude_code",
      runId: "run_usage_claude_status",
      trialId: "trial_usage_claude_status"
    });

    expect(usage.tokens.total).toEqual(expect.objectContaining({
      value: 1325,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "claude_status_line_json",
      confidence: "medium",
      evidence_refs: ["status-line.jsonl"]
    }));
    expect(usage.tokens.input).toEqual(expect.objectContaining({ value: 1000 }));
    expect(usage.tokens.output).toEqual(expect.objectContaining({ value: 200 }));
    expect(usage.tokens.cache_write).toEqual(expect.objectContaining({ value: 50 }));
    expect(usage.tokens.cache_read).toEqual(expect.objectContaining({ value: 75 }));
    expect(usage.cost.total_usd).toEqual(expect.objectContaining({
      value: 0.0123,
      unit: "usd",
      measurement_source: "native",
      capture_source: "claude_status_line_json",
      confidence: "medium",
      evidence_refs: ["status-line.jsonl"]
    }));
    expect(usage.coverage).toEqual(expect.objectContaining({
      tokens: "available",
      cost: "available"
    }));
  });

  test("extracts native tokens, cost, and model from Claude OpenTelemetry metrics", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-claude-otel-"));
    const otelPath = join(root, "otel.jsonl");
    await writeFile(
      otelPath,
      [
        {
          name: "claude_code.token.usage",
          value: 1000,
          attributes: {
            type: "input",
            model: "claude-sonnet-4-6",
            query_source: "main"
          }
        },
        {
          name: "claude_code.token.usage",
          value: 200,
          attributes: {
            type: "output",
            model: "claude-sonnet-4-6",
            query_source: "main"
          }
        },
        {
          name: "claude_code.token.usage",
          value: 75,
          attributes: {
            type: "cacheRead",
            model: "claude-sonnet-4-6",
            query_source: "main"
          }
        },
        {
          name: "claude_code.token.usage",
          value: 50,
          attributes: {
            type: "cacheCreation",
            model: "claude-sonnet-4-6",
            query_source: "main"
          }
        },
        {
          name: "claude_code.cost.usage",
          value: 0.0123,
          attributes: {
            model: "claude-sonnet-4-6",
            query_source: "main"
          }
        }
      ].map((record) => JSON.stringify(record)).join("\n"),
      "utf8"
    );

    const usageCapture = new ClaudeCodeUsageCapture({
      otelJsonlPath: otelPath
    });

    const usage = await usageCapture.captureUsage({
      provider: "claude_code",
      runId: "run_usage_claude_otel",
      trialId: "trial_usage_claude_otel"
    });

    expect(usage.llms).toEqual([
      expect.objectContaining({
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        role: "primary",
        measurement_source: "native",
        capture_source: "claude_otel",
        confidence: "high",
        evidence_refs: ["otel.jsonl"]
      })
    ]);
    expect(usage.tokens.total).toEqual(expect.objectContaining({
      value: 1325,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "claude_otel",
      confidence: "high",
      evidence_refs: ["otel.jsonl"]
    }));
    expect(usage.tokens.input).toEqual(expect.objectContaining({ value: 1000 }));
    expect(usage.tokens.output).toEqual(expect.objectContaining({ value: 200 }));
    expect(usage.tokens.cache_read).toEqual(expect.objectContaining({ value: 75 }));
    expect(usage.tokens.cache_write).toEqual(expect.objectContaining({ value: 50 }));
    expect(usage.cost.total_usd).toEqual(expect.objectContaining({
      value: 0.0123,
      unit: "usd",
      measurement_source: "native",
      capture_source: "claude_otel",
      confidence: "high",
      evidence_refs: ["otel.jsonl"]
    }));
    expect(usage.coverage).toEqual(expect.objectContaining({
      model: "available",
      tokens: "available",
      cost: "available"
    }));
  });

  test("extracts native tokens, cost, and model from Claude OpenTelemetry API request events", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-claude-otel-event-"));
    const otelPath = join(root, "otel.jsonl");
    await writeFile(
      otelPath,
      [
        {
          name: "claude_code.api_request",
          attributes: {
            "event.name": "api_request",
            model: "claude-opus-4-8",
            cost_usd: 0.02,
            input_tokens: 300,
            output_tokens: 40,
            cache_read_tokens: 10,
            cache_creation_tokens: 5
          }
        }
      ].map((record) => JSON.stringify(record)).join("\n"),
      "utf8"
    );

    const usageCapture = new ClaudeCodeUsageCapture({
      otelJsonlPath: otelPath
    });

    const usage = await usageCapture.captureUsage({
      provider: "claude_code",
      runId: "run_usage_claude_otel_event",
      trialId: "trial_usage_claude_otel_event"
    });

    expect(usage.llms).toEqual([
      expect.objectContaining({
        model: "claude-opus-4-8",
        provider: "anthropic",
        role: "primary",
        measurement_source: "native",
        capture_source: "claude_otel",
        confidence: "high",
        evidence_refs: ["otel.jsonl"]
      })
    ]);
    expect(usage.tokens.total).toEqual(expect.objectContaining({
      value: 355,
      unit: "tokens",
      measurement_source: "native",
      capture_source: "claude_otel",
      confidence: "high",
      evidence_refs: ["otel.jsonl"]
    }));
    expect(usage.tokens.input).toEqual(expect.objectContaining({ value: 300 }));
    expect(usage.tokens.output).toEqual(expect.objectContaining({ value: 40 }));
    expect(usage.tokens.cache_read).toEqual(expect.objectContaining({ value: 10 }));
    expect(usage.tokens.cache_write).toEqual(expect.objectContaining({ value: 5 }));
    expect(usage.cost.total_usd).toEqual(expect.objectContaining({
      value: 0.02,
      unit: "usd",
      measurement_source: "native",
      capture_source: "claude_otel",
      confidence: "high",
      evidence_refs: ["otel.jsonl"]
    }));
    expect(usage.coverage).toEqual(expect.objectContaining({
      model: "available",
      tokens: "available",
      cost: "available"
    }));
  });

  test("deduplicates MCP hook usage when pre and post events share a tool id", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-claude-mcp-dedupe-"));
    const hooksPath = join(root, "hooks.jsonl");
    await writeFile(
      hooksPath,
      [
        {
          hook_event_name: "PreToolUse",
          tool_name: "mcp__filesystem__read_file",
          tool_use_id: "tool-mcp-1"
        },
        {
          hook_event_name: "PostToolUse",
          tool_name: "mcp__filesystem__read_file",
          tool_use_id: "tool-mcp-1",
          tool_response: { success: true }
        }
      ].map((record) => JSON.stringify(record)).join("\n"),
      "utf8"
    );

    const usageCapture = new ClaudeCodeUsageCapture({ hooksJsonlPath: hooksPath });
    const usage = await usageCapture.captureUsage({
      provider: "claude_code",
      runId: "run_usage_claude_mcp",
      trialId: "trial_usage_claude_mcp"
    });

    expect(usage.mcps).toEqual([
      expect.objectContaining({
        server: "filesystem",
        tool: "read_file",
        call_count: 1,
        measurement_source: "derived",
        capture_source: "hook_events",
        confidence: "medium",
        evidence_refs: ["hooks.jsonl"]
      })
    ]);
  });

  test("extracts Claude Code TaskCreate and TaskUpdate hooks as subagent evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-claude-task-hooks-"));
    const hooksPath = join(root, "hooks.jsonl");
    await writeFile(
      hooksPath,
      [
        {
          hook_event_name: "TaskCreate",
          task_id: "task-1",
          task_name: "Explore",
          subagent_type: "analysis",
          model: "claude-sonnet-4-6",
          occurred_at: "2026-06-21T12:00:00.000Z"
        },
        {
          hook_event_name: "TaskUpdate",
          task_id: "task-1",
          status: "completed",
          occurred_at: "2026-06-21T12:00:10.000Z"
        }
      ].map((record) => JSON.stringify(record)).join("\n"),
      "utf8"
    );

    const usageCapture = new ClaudeCodeUsageCapture({ hooksJsonlPath: hooksPath });
    const usage = await usageCapture.captureUsage({
      provider: "claude_code",
      runId: "run_usage_claude_tasks",
      trialId: "trial_usage_claude_tasks"
    });

    expect(usage.subagents).toEqual([
      expect.objectContaining({
        id: "task-1",
        name: "Explore",
        started_at: "2026-06-21T12:00:00.000Z",
        ended_at: "2026-06-21T12:00:10.000Z",
        llms: [expect.objectContaining({
          model: "claude-sonnet-4-6",
          role: "subagent",
          measurement_source: "derived",
          capture_source: "hook_events"
        })],
        tokens: {
          total: expect.objectContaining({
            value: null,
            measurement_source: "unavailable",
            unavailable_reason: "provider did not expose per-subagent usage"
          })
        },
        cost: {
          total_usd: expect.objectContaining({
            value: null,
            measurement_source: "unavailable",
            unavailable_reason: "provider did not expose per-subagent cost"
          })
        }
      })
    ]);
    expect(usage.coverage.subagents).toBe("partial");
  });
});
