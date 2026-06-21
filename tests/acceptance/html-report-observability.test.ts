import { describe, expect, test } from "vitest";

import {
  buildSuiteReport,
  renderSuiteReportHtml,
  type SuiteArtifactIndex,
  type SuiteTrialReport
} from "../../src/domain/reports/suite-report.js";

describe("HTML report observability", () => {
  test("renders ranking controls, visual summaries, source badges, usage, and artifact integrity", () => {
    const report = buildSuiteReport({
      runId: "run_html_observability",
      suite: { id: "observability-suite", version: "1.0.0", name: "Observability suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [codexTrial(), claudeTrial()]
    });

    const html = renderSuiteReportHtml(report);

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

    expect(html).toContain("LLM/model by harness");
    expect(html).toContain("gpt-5.5");
    expect(html).toContain("claude-sonnet-4");
    expect(html).toContain("Subagents by harness");
    expect(html).toContain("Explore");
    expect(html).toContain("Skills by harness");
    expect(html).toContain("code-review");
    expect(html).toContain("MCP usage by harness");
    expect(html).toContain("github.pull_request_read");

    expect(html).toContain("source-badge");
    expect(html).toContain("native/codex_cli_process_output/medium");
    expect(html).toContain("unavailable/usage_capture/none");
    expect(html).toContain("no native billing or pricing source configured");
    expect(html).toContain("provider did not expose per-subagent usage");

    expect(html).toContain("hooks.jsonl");
    expect(html).toContain("artifact-index.json");
    expect(html).toContain("transcript path was not exposed");
    expect(html).toContain("href=\"specs/usage-observability/codex/trial_1/result.json\"");
    expect(html).not.toContain("href=\"specs/usage-observability/codex/trial_1/transcript.jsonl\"");

    expect(html).toContain("data-cost-rank=\"2\"");
    expect(html).toContain("data-token-rank=\"1\"");
    expect(html.indexOf("data-harness=\"codex\" data-rank=\"1\"")).toBeLessThan(
      html.indexOf("data-harness=\"claude_code\" data-rank=\"2\"")
    );

    expect(html).not.toContain("raw_payloads");
    expect(html).not.toContain("raw hook payload");
    expect(html).not.toContain("full transcript contents");
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
    tags: ["observability"],
    artifact_refs: [
      "specs/usage-observability/codex/trial_1/result.json",
      "specs/usage-observability/codex/trial_1/hooks.jsonl",
      "specs/usage-observability/codex/trial_1/artifact-index.json"
    ],
    artifact_integrity: {
      artifacts: [
        artifact("specs/usage-observability/codex/trial_1/result.json", true),
        artifact("specs/usage-observability/codex/trial_1/hooks.jsonl", true),
        artifact("specs/usage-observability/codex/trial_1/transcript.jsonl", false, "transcript path was not exposed")
      ]
    },
    comparability: { status: "limited", reasons: ["metric_unavailable:cost"] },
    metrics: [
      metric("token_usage", 1200, "tokens", "native", "codex_cli_process_output", "medium"),
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
    notes: ["full transcript contents are stored only as an artifact"]
  };
}

function metric(
  name: string,
  value: number,
  unit: string,
  measurementSource: "native",
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
