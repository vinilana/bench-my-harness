import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

import {
  buildSuiteReport,
  type SuiteTrialReport
} from "../../src/domain/reports/suite-report.js";
import { renderSuiteReportHtml } from "../../src/adapters/outbound/reports/suite-html-report.js";

describe("HTML report ranking semantics", () => {
  test("does not imply a cost or token winner when every harness lacks that dimension", () => {
    const html = renderSuiteReportHtml(buildSuiteReport({
      runId: "run_ranking_unavailable",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_codex"),
        trial("claude_code", "trial_claude")
      ]
    }));

    expect(html).toContain("data-ranking-status=\"unavailable\"");
    expect(html).toContain("data-cost-rank=\"\"");
    expect(html).toContain("data-token-rank=\"\"");
    expect(html).toContain("Cost and token rankings with missing data are unavailable");
  });

  test("ranks known cost and token values ahead of unavailable values", () => {
    const html = renderSuiteReportHtml(buildSuiteReport({
      runId: "run_ranking_limited",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        trial("codex", "trial_codex", [
          metric("token_usage", 1000, "tokens"),
          metric("cost", 0.2, "usd")
        ]),
        trial("claude_code", "trial_claude")
      ]
    }));

    const codexRow = html.match(/<tr data-harness="codex"[^>]+>/)?.[0] ?? "";
    const claudeRow = html.match(/<tr data-harness="claude_code"[^>]+>/)?.[0] ?? "";

    expect(codexRow).toContain("data-cost-rank=\"1\"");
    expect(codexRow).toContain("data-token-rank=\"1\"");
    expect(claudeRow).toContain("data-cost-rank=\"\"");
    expect(claudeRow).toContain("data-token-rank=\"\"");
  });

  test("renders independent ranks for duration and cost/token efficiency dimensions", () => {
    const html = renderSuiteReportHtml(buildSuiteReport({
      runId: "run_ranking_efficiency",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        rankedTrial("codex", "trial_codex_1", 1000, 1, [
          metric("token_usage", 1000, "tokens"),
          metric("cost", 1, "usd")
        ]),
        rankedTrial("codex", "trial_codex_2", 800, 1, [
          metric("token_usage", 1000, "tokens"),
          metric("cost", 1, "usd")
        ]),
        rankedTrial("claude_code", "trial_claude", 200, 0.25, [
          metric("token_usage", 1500, "tokens"),
          metric("cost", 1.5, "usd")
        ])
      ]
    }));

    const codexRow = html.match(/<tr data-harness="codex"[^>]+>/)?.[0] ?? "";
    const claudeRow = html.match(/<tr data-harness="claude_code"[^>]+>/)?.[0] ?? "";

    expect(codexRow).toContain("data-token-rank=\"2\"");
    expect(codexRow).toContain("data-token-efficiency-rank=\"1\"");
    expect(codexRow).toContain("data-cost-rank=\"2\"");
    expect(codexRow).toContain("data-cost-completed-rank=\"1\"");
    expect(codexRow).toContain("data-cost-score-rank=\"1\"");
    expect(codexRow).toContain("data-duration-rank=\"2\"");

    expect(claudeRow).toContain("data-token-rank=\"1\"");
    expect(claudeRow).toContain("data-token-efficiency-rank=\"2\"");
    expect(claudeRow).toContain("data-cost-rank=\"1\"");
    expect(claudeRow).toContain("data-cost-completed-rank=\"2\"");
    expect(claudeRow).toContain("data-cost-score-rank=\"2\"");
    expect(claudeRow).toContain("data-duration-rank=\"1\"");
  });

  test("embedded ranking and filter script runs against report DOM controls", () => {
    const html = renderSuiteReportHtml(buildSuiteReport({
      runId: "run_ranking_runtime",
      suite: { id: "suite", version: "1.0.0", name: "Suite" },
      selectedHarnesses: ["codex", "claude_code"],
      generatedAt: "2026-06-21T12:00:00.000Z",
      trials: [
        rankedTrial("codex", "trial_codex", 1000, 1, [
          metric("token_usage", 1000, "tokens"),
          metric("cost", 2, "usd")
        ]),
        rankedTrial("claude_code", "trial_claude", 500, 1, [
          metric("token_usage", 1200, "tokens"),
          metric("cost", 1, "usd")
        ])
      ]
    }));
    const runtime = executeReportScript(html);

    runtime.controls["ranking-dimension"].value = "cost";
    runtime.controls["ranking-dimension"].dispatch("change");
    expect(runtime.rankingParent.children.map((row) => row.dataset.harness)).toEqual(["claude_code", "codex"]);
    expect(runtime.controls["best-harness"].textContent).toBe("claude_code");

    runtime.controls["filter-harness"].value = "codex";
    runtime.controls["filter-harness"].dispatch("input");
    expect(runtime.trialRows.find((row) => row.dataset.harness === "codex")?.hidden).toBe(false);
    expect(runtime.trialRows.find((row) => row.dataset.harness === "claude_code")?.hidden).toBe(true);
  });
});

function trial(
  harness: "codex" | "claude_code",
  trialId: string,
  metrics: SuiteTrialReport["metrics"] = [
    unavailableMetric("token_usage", "provider did not expose total token usage"),
    unavailableMetric("cost", "no native billing or pricing source configured")
  ]
): SuiteTrialReport {
  return {
    spec_id: "ranking",
    spec_version: "1.0.0",
    harness,
    trial_id: trialId,
    status: "completed",
    score: 1,
    tags: [],
    artifact_refs: [],
    comparability: { status: "comparable", reasons: [] },
    metrics,
    notes: []
  };
}

function rankedTrial(
  harness: "codex" | "claude_code",
  trialId: string,
  durationMs: number,
  score: number,
  metrics: SuiteTrialReport["metrics"]
): SuiteTrialReport {
  return {
    ...trial(harness, trialId, metrics),
    duration_ms: durationMs,
    score
  };
}

function metric(
  name: string,
  value: number,
  unit: string
): SuiteTrialReport["metrics"][number] {
  return {
    metric: name,
    value,
    unit,
    measurement_source: "native",
    capture_source: "test_fixture",
    confidence: "high"
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

function executeReportScript(html: string): {
  controls: Record<string, FakeElement>;
  rankingParent: FakeParent;
  trialRows: FakeElement[];
} {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (script === undefined) {
    throw new Error("report script was not rendered");
  }

  const controls = Object.fromEntries([
    "filter-harness",
    "filter-spec",
    "filter-tag",
    "filter-status",
    "filter-comparability",
    "ranking-dimension",
    "best-harness"
  ].map((id) => [id, new FakeElement()]));
  const rankingParent = new FakeParent();
  const rankingRows = [
    new FakeElement({ harness: "codex", rank: "1", costRank: "2" }),
    new FakeElement({ harness: "claude_code", rank: "2", costRank: "1" })
  ];
  rankingParent.children = rankingRows;
  for (const row of rankingRows) {
    row.parentElement = rankingParent;
  }
  const trialRows = [
    new FakeElement({ harness: "codex", spec: "ranking", tags: "", status: "completed", comparability: "comparable" }),
    new FakeElement({ harness: "claude_code", spec: "ranking", tags: "", status: "completed", comparability: "comparable" })
  ];
  const viewButtons = [new FakeElement(), new FakeElement(), new FakeElement()];

  runInNewContext(script, {
    document: {
      getElementById: (id: string) => controls[id],
      querySelectorAll: (selector: string) => {
        if (selector === "#ranking-rows tr") {
          return rankingRows;
        }
        if (selector === "#trial-rows tr") {
          return trialRows;
        }
        if (selector === ".views button") {
          return viewButtons;
        }
        return [];
      }
    }
  });

  return { controls, rankingParent, trialRows };
}

class FakeParent {
  public children: FakeElement[] = [];

  public appendChild(row: FakeElement): void {
    this.children = this.children.filter((child) => child !== row);
    this.children.push(row);
  }
}

class FakeElement {
  public readonly dataset: Record<string, string>;
  public value = "";
  public hidden = false;
  public textContent = "";
  public parentElement: FakeParent = new FakeParent();
  private readonly listeners = new Map<string, () => void>();

  public constructor(dataset: Record<string, string> = {}) {
    this.dataset = dataset;
  }

  public addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  public dispatch(type: string): void {
    this.listeners.get(type)?.();
  }

  public setAttribute(): void {}
}
