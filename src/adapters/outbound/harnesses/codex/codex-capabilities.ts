export type CapabilityConfidence = "native" | "derived" | "estimated" | "partial" | "unavailable" | "unknown";

export interface CodexCapabilityMatrix {
  provider: "codex";
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

export function codexCapabilities(): CodexCapabilityMatrix {
  return {
    provider: "codex",
    adapter_version: "codex-hooks@0.1.0",
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
    }
  };
}
