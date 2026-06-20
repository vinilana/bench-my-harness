export type CapabilityConfidence = "native" | "derived" | "estimated" | "partial" | "unavailable" | "unknown";

export interface ClaudeCodeCapabilityMatrix {
  provider: "claude_code";
  adapter_version: string;
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
}

export function claudeCodeCapabilities(): ClaudeCodeCapabilityMatrix {
  return {
    provider: "claude_code",
    adapter_version: "claude-code-hooks@0.1.0",
    capabilities: {
      session_lifecycle: "native",
      turn_lifecycle: "native",
      tool_lifecycle: "native",
      file_events: "derived",
      command_events: "native",
      approval_events: "native",
      token_usage: "unavailable",
      context_usage: "partial",
      stable_event_ids: "unknown",
      stdin: true,
      webhook: false,
      file_import: true,
      project_local_hooks: true
    }
  };
}
