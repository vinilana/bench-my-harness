export type CapabilityConfidence = "native" | "derived" | "estimated" | "partial" | "unavailable" | "unknown";

export interface ClaudeCodeCapabilityMatrix {
  provider: "claude_code";
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
  capability_evidence: Readonly<Record<keyof ClaudeCodeCapabilityMatrix["capabilities"], readonly string[]>>;
  known_gaps: readonly string[];
}

export function claudeCodeCapabilities(): ClaudeCodeCapabilityMatrix {
  return {
    provider: "claude_code",
    adapter_version: "claude-code-hooks@0.1.0",
    supported_provider_versions: [
      "claude-code hooks schema: SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/PostToolBatch/TaskCreate/TaskUpdate/Stop",
      "claude-code transcript JSONL, status-line JSON, process JSON, and OpenTelemetry usage evidence when trial-local paths are available"
    ],
    capabilities: {
      session_lifecycle: "native",
      turn_lifecycle: "native",
      tool_lifecycle: "native",
      file_events: "derived",
      command_events: "native",
      approval_events: "native",
      token_usage: "partial",
      context_usage: "partial",
      stable_event_ids: "unknown",
      stdin: true,
      webhook: false,
      file_import: true,
      project_local_hooks: true
    },
    capability_evidence: {
      session_lifecycle: ["src/adapters/outbound/harnesses/claude-code/claude-code-hook-installer.ts"],
      turn_lifecycle: ["src/adapters/outbound/harnesses/claude-code/claude-code-hook-installer.ts"],
      tool_lifecycle: [
        "src/adapters/outbound/harnesses/claude-code/claude-code-hook-installer.ts",
        "src/domain/metrics/derived-metrics.ts"
      ],
      file_events: ["src/domain/metrics/derived-metrics.ts"],
      command_events: ["src/domain/metrics/derived-metrics.ts"],
      approval_events: ["src/adapters/outbound/harnesses/claude-code/claude-code-hook-installer.ts"],
      token_usage: [
        "src/adapters/outbound/usage/claude-code-usage-capture.ts",
        "tests/acceptance/claude-usage-capture.test.ts",
        "docs/specs/20-usage-artifacts-and-report-observability.md#claude-code"
      ],
      context_usage: ["docs/specs/20-usage-artifacts-and-report-observability.md#claude-code"],
      stable_event_ids: ["src/adapters/outbound/harnesses/provider-raw-hook-event-normalizer.ts"],
      stdin: ["src/adapters/outbound/harnesses/harness-command-profiles.ts"],
      webhook: ["docs/specs/10-automatic-harness-instrumentation.md"],
      file_import: ["src/application/use-cases/ingest-file-events.ts"],
      project_local_hooks: ["src/adapters/outbound/harnesses/claude-code/claude-code-hook-installer.ts"]
    },
    known_gaps: [
      "token_usage is partial unless transcript, status-line, process JSON, or OpenTelemetry evidence is available",
      "context_usage is partial because only compact/context lifecycle hooks are captured",
      "stable_event_ids are derived from raw event ids rather than native provider ids"
    ]
  };
}
