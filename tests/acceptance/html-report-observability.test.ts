import { describe, expect, test } from "vitest";

import {
  buildSuiteReport,
  type SuiteArtifactIndex,
  type SuiteTrialReport
} from "../../src/domain/reports/suite-report.js";
import { renderSuiteReportHtml } from "../../src/adapters/outbound/reports/suite-html-report.js";

describe("HTML report observability", () => {
  test("renders ranking controls, visual summaries, source badges, usage, and artifact integrity", () => {
    const report = buildSuiteReport({
      runId: "run_html_observability",
      suite: { id: "observability-suite", version: "1.0.0", name: "Observability suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [codexTrial(), claudeTrial()]
    });

    expect(report.security.redaction.status).toBe("pending");

    const html = renderSuiteReportHtml(report);

    expect(html).toContain("Redaction: not_needed");
    expect(html).toContain("ranking-dimension");
    expect(html).toContain("overall score");
    expect(html).toContain("duration");
    expect(html).toContain("total cost");
    expect(html).toContain("total tokens");
    expect(html).toContain("tokens per completed trial");
    expect(html).toContain("cost per completed trial");
    expect(html).toContain("cost per score point");
    expect(html).toContain("data-ranking-status=\"limited\"");
    expect(html).toContain("Best harness for selected ranking");

    expect(html).toContain("Duration by harness");
    expect(html).toContain("Score by harness");
    expect(html).toContain("Total tokens by harness");
    expect(html).toContain("Total cost by harness");
    expect(html).toContain("Observability coverage by harness");
    expect(html).toContain("Artifact integrity by harness/spec");
    expect(html).toContain("<svg");
    expect(html).toContain("Input Tokens");
    expect(html).toContain("Output Tokens");
    expect(html).toContain("Cost / 1M Tokens");
    expect(html).toContain("Interactions");
    expect(html).toContain("Tool Calls");
    expect(html).toContain("Tool Failures");

    expect(html).toContain("LLM/model by harness");
    expect(html).toContain("Token and cost by harness");
    expect(html).toContain("input 900 tokens");
    expect(html).toContain("output 300 tokens");
    expect(html).toContain("cache read 100 tokens");
    expect(html).toContain("cache write 50 tokens");
    expect(html).toContain("gpt-5.5");
    expect(html).toContain("claude-sonnet-4");
    expect(html).toContain("Subagents by harness");
    expect(html).toContain("Explore");
    expect(html).toContain("Skills by harness");
    expect(html).toContain("code-review");
    expect(html).toContain("MCP usage by harness");
    expect(html).toContain("github.pull_request_read");
    expect(html).toContain("Hook tool calls by harness");
    expect(html).toContain("Bash");
    expect(html).toContain("apply_patch");
    expect(html).toContain("2 count");
    expect(html).toContain("1 count");
    expect(html).toContain("Adapter Capabilities");
    expect(html).toContain("codex-hooks@0.1.0");
    expect(html).toContain("claude-code-hooks@0.1.0");
    expect(html).toContain("codex hooks schema");
    expect(html).toContain("claude-code hooks schema");
    expect(html).toContain("docs/specs/20-usage-artifacts-and-report-observability.md#codex");
    expect(html).toContain("docs/specs/20-usage-artifacts-and-report-observability.md#claude-code");
    expect(html).toContain("tool_lifecycle");
    expect(html).toContain("partial");
    expect(html).toContain("native");

    expect(html).toContain("source-badge");
    expect(html).toContain("native/codex_cli_process_output/medium");
    expect(html).toContain("unavailable/usage_capture/none");
    expect(html).toContain("no native billing or pricing source configured");
    expect(html).toContain("provider did not expose per-subagent usage");
    expect(html).toContain("Process Duration");
    expect(html).toContain("Exit Status");
    expect(html).toContain("duration 1000 ms");
    expect(html).toContain("exit 0");
    expect(html).toContain("process-stdout.txt");
    expect(html).toContain("process-stderr.txt");
    expect(html).toContain("process-exit.json");
    expect(html).toContain("Model gpt-5.5");
    expect(html).toContain("total 1200 tokens");
    expect(html).toContain("cost unavailable");
    expect(html).toContain("provider did not expose total token usage");
    expect(html).toContain("Subagent Explore");
    expect(html).toContain("Skill code-review");
    expect(html).toContain("MCP github.pull_request_read calls 3");

    expect(html).toContain("hooks.jsonl");
    expect(html).toContain("artifact-index.json");
    expect(html).toContain("transcript path was not exposed");
    expect(html).toContain("href=\"specs/usage-observability/codex/trial_1/result.json\"");
    expect(html).toContain("href=\"specs/usage-observability/codex/trial_1/hooks.jsonl\"");
    expect(html).toContain("href=\"specs/usage-observability/codex/trial_1/process-stderr.txt\">process-stderr.txt</a>");
    expect(html).not.toContain("href=\"hooks.jsonl\"");
    expect(html).not.toContain("href=\"specs/usage-observability/codex/trial_1/transcript.jsonl\"");

    const codexRankingRow = html.match(/<tr data-harness="codex"[^>]+>/)?.[0] ?? "";
    const claudeRankingRow = html.match(/<tr data-harness="claude_code"[^>]+>/)?.[0] ?? "";
    expect(codexRankingRow).toContain("data-rank=\"1\"");
    expect(codexRankingRow).toContain("data-cost-rank=\"\"");
    expect(codexRankingRow).toContain("data-token-rank=\"1\"");
    expect(claudeRankingRow).toContain("data-rank=\"2\"");
    expect(claudeRankingRow).toContain("data-cost-rank=\"1\"");
    expect(claudeRankingRow).toContain("data-token-rank=\"\"");
    expect(html).toContain("data-token-rank=\"1\"");
    expect(html.indexOf("data-harness=\"codex\" data-rank=\"1\"")).toBeLessThan(
      html.indexOf("data-harness=\"claude_code\" data-rank=\"2\"")
    );

    expect(html).not.toContain("raw_payloads");
    expect(html).not.toContain("raw hook payload");
    expect(html).not.toContain("full transcript contents");
  });

  test("renders cost per 1M tokens with derived provenance and evidence refs", () => {
    const report = buildSuiteReport({
      runId: "run_html_cost_per_token",
      suite: { id: "observability-suite", version: "1.0.0", name: "Observability suite" },
      selectedHarnesses: ["codex"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [{
        ...codexTrial(),
        metrics: [
          metricWithEvidence("token_usage", 1000, "tokens", "native", "codex_session_transcript", "medium", ["transcript.jsonl"]),
          metricWithEvidence("cost", 0.2, "usd", "estimated", "openai_pricing_table", "low", ["transcript.jsonl", "pricing:openai"])
        ]
      }]
    });

    const html = renderSuiteReportHtml(report);

    expect(html).toContain("200 USD");
    expect(html).toContain("derived/suite_summary_ratio/low");
    expect(html).toContain("evidence");
    expect(html).toContain("transcript.jsonl");
    expect(html).toContain("pricing:openai");
  });
});

function codexTrial(): SuiteTrialReport {
  return {
    spec_id: "usage-observability",
    spec_version: "1.0.0",
    harness: "codex",
    trial_id: "trial_1",
    status: "completed",
    score: 0.9,
    duration_ms: 1000,
    diagnostics: diagnostics("specs/usage-observability/codex/trial_1", 0, 1000),
    tags: ["observability"],
    artifact_refs: [
      "specs/usage-observability/codex/trial_1/result.json",
      "specs/usage-observability/codex/trial_1/process-stdout.txt",
      "specs/usage-observability/codex/trial_1/process-stderr.txt",
      "specs/usage-observability/codex/trial_1/process-exit.json",
      "specs/usage-observability/codex/trial_1/hooks.jsonl",
      "specs/usage-observability/codex/trial_1/artifact-index.json"
    ],
    artifact_integrity: {
      artifacts: [
        artifact("specs/usage-observability/codex/trial_1/result.json", true),
        artifact("hooks.jsonl", true),
        artifact("specs/usage-observability/codex/trial_1/transcript.jsonl", false, "transcript path was not exposed")
      ]
    },
    comparability: { status: "limited", reasons: ["metric_unavailable:cost"] },
    metrics: [
      metric("token_usage", 1200, "tokens", "native", "codex_cli_process_output", "medium"),
      metric("input_tokens", 900, "tokens", "native", "codex_cli_process_output", "medium"),
      metric("output_tokens", 300, "tokens", "native", "codex_cli_process_output", "medium"),
      metric("cache_read_tokens", 100, "tokens", "native", "codex_cli_process_output", "medium"),
      metric("cache_write_tokens", 50, "tokens", "native", "codex_cli_process_output", "medium"),
      metric("agent_interactions_total", 2, "count", "derived", "normalized_events", "high"),
      metric("tool_calls_total", 3, "count", "derived", "normalized_events", "high"),
      metric("tool_calls_failed", 1, "count", "derived", "normalized_events", "high"),
      metricWithEvidence("tool_calls_by_type.Bash", 2, "count", "derived", "normalized_events", "high", ["hooks.jsonl"]),
      metricWithEvidence("tool_calls_by_type.apply_patch", 1, "count", "derived", "normalized_events", "high", ["hooks.jsonl"]),
      unavailableMetric("cost", "no native billing or pricing source configured")
    ],
    usage: {
      llms: [
        {
          model: "gpt-5.5",
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
          value: 1200,
          unit: "tokens",
          measurement_source: "native",
          capture_source: "codex_cli_process_output",
          confidence: "medium",
          evidence_refs: ["process-stderr.txt"]
        },
        input: {
          value: 900,
          unit: "tokens",
          measurement_source: "native",
          capture_source: "codex_cli_process_output",
          confidence: "medium",
          evidence_refs: ["process-stderr.txt"]
        },
        output: {
          value: 300,
          unit: "tokens",
          measurement_source: "native",
          capture_source: "codex_cli_process_output",
          confidence: "medium",
          evidence_refs: ["process-stderr.txt"]
        },
        cache_read: {
          value: 100,
          unit: "tokens",
          measurement_source: "native",
          capture_source: "codex_cli_process_output",
          confidence: "medium",
          evidence_refs: ["process-stderr.txt"]
        },
        cache_write: {
          value: 50,
          unit: "tokens",
          measurement_source: "native",
          capture_source: "codex_cli_process_output",
          confidence: "medium",
          evidence_refs: ["process-stderr.txt"]
        }
      },
      subagents: [
        {
          id: "subagent_1",
          name: "Explore",
          llms: [],
          tokens: {
            total: {
              value: null,
              unit: "tokens",
              measurement_source: "unavailable",
              capture_source: "subagent_usage_capture",
              confidence: "none",
              unavailable_reason: "provider did not expose per-subagent usage"
            }
          },
          cost: {
            total_usd: {
              value: null,
              unit: "usd",
              measurement_source: "unavailable",
              capture_source: "subagent_usage_capture",
              confidence: "none",
              unavailable_reason: "provider did not expose per-subagent cost"
            }
          },
          evidence_refs: ["hooks.jsonl"]
        }
      ],
      skills: [
        {
          name: "code-review",
          source: "codex",
          invocation: "explicit",
          measurement_source: "derived",
          capture_source: "transcript",
          confidence: "medium",
          evidence_refs: ["transcript.jsonl"]
        }
      ],
      mcps: [
        {
          server: "github",
          tool: "pull_request_read",
          call_count: 3,
          measurement_source: "derived",
          capture_source: "hook_events",
          confidence: "medium",
          evidence_refs: ["hooks.jsonl"]
        }
      ],
      coverage: {
        model: "available",
        tokens: "available",
        cost: "unavailable",
        subagents: "partial",
        skills: "partial",
        mcp: "partial"
      }
    },
    adapter_capabilities: {
      provider: "codex",
      adapter_version: "codex-hooks@0.1.0",
      supported_provider_versions: [
        "codex hooks schema"
      ],
      capabilities: {
        session_lifecycle: "native",
        turn_lifecycle: "partial",
        tool_lifecycle: "partial",
        token_usage: "unavailable",
        context_usage: "unavailable",
        project_local_hooks: true
      },
      capability_evidence: {
        session_lifecycle: ["docs/specs/20-usage-artifacts-and-report-observability.md#codex"],
        turn_lifecycle: ["docs/specs/20-usage-artifacts-and-report-observability.md#codex"],
        tool_lifecycle: ["docs/specs/20-usage-artifacts-and-report-observability.md#codex"],
        token_usage: ["docs/specs/20-usage-artifacts-and-report-observability.md#codex"],
        context_usage: ["docs/specs/20-usage-artifacts-and-report-observability.md#codex"],
        project_local_hooks: ["docs/specs/20-usage-artifacts-and-report-observability.md#codex"]
      },
      known_gaps: ["context_usage unavailable"]
    },
    notes: []
  };
}

function claudeTrial(): SuiteTrialReport {
  return {
    spec_id: "usage-observability",
    spec_version: "1.0.0",
    harness: "claude_code",
    trial_id: "trial_1",
    status: "completed",
    score: 0.8,
    duration_ms: 800,
    diagnostics: diagnostics("specs/usage-observability/claude_code/trial_1", 0, 800),
    tags: ["observability"],
    artifact_refs: [
      "specs/usage-observability/claude_code/trial_1/result.json",
      "specs/usage-observability/claude_code/trial_1/artifact-index.json"
    ],
    artifact_integrity: {
      artifacts: [
        artifact("specs/usage-observability/claude_code/trial_1/result.json", true),
        artifact("specs/usage-observability/claude_code/trial_1/transcript.jsonl", false, "transcript path was not exposed")
      ]
    },
    comparability: { status: "limited", reasons: ["metric_unavailable:token_usage"] },
    metrics: [
      unavailableMetric("token_usage", "provider did not expose total token usage"),
      metric("cost", 0.3, "usd", "native", "claude_otel", "high")
    ],
    usage: {
      llms: [
        {
          model: "claude-sonnet-4",
          provider: "anthropic",
          role: "primary",
          measurement_source: "native",
          capture_source: "claude_otel",
          confidence: "high",
          evidence_refs: ["usage.json"]
        }
      ],
      subagents: [],
      skills: [],
      mcps: [],
      coverage: {
        model: "available",
        tokens: "unavailable",
        cost: "available",
        subagents: "unavailable",
        skills: "unavailable",
        mcp: "unavailable"
      }
    },
    adapter_capabilities: {
      provider: "claude_code",
      adapter_version: "claude-code-hooks@0.1.0",
      supported_provider_versions: [
        "claude-code hooks schema"
      ],
      capabilities: {
        session_lifecycle: "native",
        turn_lifecycle: "native",
        tool_lifecycle: "native",
        token_usage: "unavailable",
        context_usage: "partial",
        project_local_hooks: true
      },
      capability_evidence: {
        session_lifecycle: ["docs/specs/20-usage-artifacts-and-report-observability.md#claude-code"],
        turn_lifecycle: ["docs/specs/20-usage-artifacts-and-report-observability.md#claude-code"],
        tool_lifecycle: ["docs/specs/20-usage-artifacts-and-report-observability.md#claude-code"],
        token_usage: ["docs/specs/20-usage-artifacts-and-report-observability.md#claude-code"],
        context_usage: ["docs/specs/20-usage-artifacts-and-report-observability.md#claude-code"],
        project_local_hooks: ["docs/specs/20-usage-artifacts-and-report-observability.md#claude-code"]
      },
      known_gaps: ["token_usage unavailable without usage evidence"]
    },
    notes: ["full transcript contents are stored only as an artifact"]
  };
}

function metric(
  name: string,
  value: number,
  unit: string,
  measurementSource: "native" | "derived",
  captureSource: string,
  confidence: "high" | "medium"
): SuiteTrialReport["metrics"][number] {
  return {
    metric: name,
    value,
    unit,
    measurement_source: measurementSource,
    capture_source: captureSource,
    confidence
  };
}

function metricWithEvidence(
  name: string,
  value: number,
  unit: string,
  measurementSource: "native" | "derived" | "estimated",
  captureSource: string,
  confidence: "high" | "medium" | "low",
  evidenceRefs: readonly string[]
): SuiteTrialReport["metrics"][number] {
  return {
    metric: name,
    value,
    unit,
    measurement_source: measurementSource,
    capture_source: captureSource,
    confidence,
    evidence_refs: evidenceRefs
  };
}

function unavailableMetric(
  name: string,
  unavailableReason: string
): SuiteTrialReport["metrics"][number] {
  return {
    metric: name,
    value: null,
    measurement_source: "unavailable",
    capture_source: "usage_capture",
    confidence: "none",
    unavailable_reason: unavailableReason
  };
}

function artifact(
  ref: string,
  exists: boolean,
  unavailableReason?: string
): SuiteArtifactIndex["artifacts"][number] {
  return {
    ref,
    exists,
    bytes: exists ? 128 : undefined,
    sha256: exists ? "sha256:abc123" : undefined,
    kind: ref.endsWith("hooks.jsonl") ? "hooks" : "result",
    unavailable_reason: unavailableReason
  };
}

function diagnostics(
  trialRoot: string,
  exitCode: number,
  durationMs: number
): SuiteTrialReport["diagnostics"] {
  return {
    process: {
      stdout_ref: `${trialRoot}/process-stdout.txt`,
      stderr_ref: `${trialRoot}/process-stderr.txt`,
      exit_ref: `${trialRoot}/process-exit.json`,
      exit_code: exitCode,
      timed_out: false,
      started_at: "2026-06-21T12:00:00.000Z",
      ended_at: "2026-06-21T12:00:01.000Z",
      duration_ms: durationMs
    }
  };
}
