export type CapabilityConfidence = "native" | "derived" | "estimated" | "partial" | "unavailable" | "unknown";

export interface CodexCapabilityMatrix {
  provider: "codex";
  adapter_version: string;
  supported_provider_versions: readonly string[];
  capabilities: {
    session_lifecycle: CapabilityConfidence;
    turn_lifecycle: CapabilityConfidence;
    tool_lifecycle: CapabilityConfidence;
    file_events: CapabilityConfidence;
    command_events: CapabilityConfidence;
    approval_events: CapabilityConfidence;
    token_usage: CapabilityConfidence;
    context_usage: CapabilityConfidence;
    stable_event_ids: CapabilityConfidence;
    stdin: boolean;
    webhook: boolean;
    file_import: boolean;
    project_local_hooks: boolean;
  };
  capability_evidence: Readonly<Record<keyof CodexCapabilityMatrix["capabilities"], readonly string[]>>;
  known_gaps: readonly string[];
}

export function codexCapabilities(): CodexCapabilityMatrix {
  return {
    provider: "codex",
    adapter_version: "codex-hooks@0.1.0",
    supported_provider_versions: [
      "codex hooks schema: SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop/SubagentStart/SubagentStop",
      "codex CLI process output and session transcript usage evidence"
    ],
    capabilities: {
      session_lifecycle: "native",
      turn_lifecycle: "partial",
      tool_lifecycle: "partial",
      file_events: "derived",
      command_events: "partial",
      approval_events: "unavailable",
      token_usage: "unavailable",
      context_usage: "unavailable",
      stable_event_ids: "unknown",
      stdin: true,
      webhook: false,
      file_import: true,
      project_local_hooks: true
    },
    capability_evidence: {
      session_lifecycle: ["src/adapters/outbound/harnesses/codex/codex-hook-installer.ts"],
      turn_lifecycle: ["src/adapters/outbound/harnesses/codex/codex-hook-installer.ts"],
      tool_lifecycle: [
        "src/adapters/outbound/harnesses/codex/codex-hook-installer.ts",
        "src/domain/metrics/derived-metrics.ts"
      ],
      file_events: ["src/domain/metrics/derived-metrics.ts"],
      command_events: ["src/domain/metrics/derived-metrics.ts"],
      approval_events: ["docs/specs/20-usage-artifacts-and-report-observability.md#codex"],
      token_usage: [
        "src/adapters/outbound/usage/codex-usage-capture.ts",
        "docs/specs/20-usage-artifacts-and-report-observability.md#codex"
      ],
      context_usage: ["docs/specs/20-usage-artifacts-and-report-observability.md#codex"],
      stable_event_ids: ["src/adapters/outbound/harnesses/provider-raw-hook-event-normalizer.ts"],
      stdin: ["src/adapters/outbound/harnesses/harness-command-profiles.ts"],
      webhook: ["docs/specs/10-automatic-harness-instrumentation.md"],
      file_import: ["src/application/use-cases/ingest-file-events.ts"],
      project_local_hooks: ["src/adapters/outbound/harnesses/codex/codex-hook-installer.ts"]
    },
    known_gaps: [
      "approval_events unavailable from current Codex hook coverage",
      "context_usage unavailable unless future Codex evidence exposes it",
      "stable_event_ids are derived from raw event ids rather than native provider ids"
    ]
  };
}
