import { describe, expect, test } from "vitest";
import { codexCapabilities } from "../../src/adapters/outbound/harnesses/codex/codex-capabilities.js";
import { claudeCodeCapabilities } from "../../src/adapters/outbound/harnesses/claude-code/claude-code-capabilities.js";

describe("adapter capability matrices", () => {
  test("Codex declares partial tool coverage and non-native token/context usage for hooks", () => {
    const capabilities = codexCapabilities();

    expect(capabilities.provider).toBe("codex");
    expect(capabilities.supported_provider_versions).toEqual(expect.arrayContaining([
      expect.stringContaining("codex")
    ]));
    expect(capabilities.capabilities.tool_lifecycle).toBe("partial");
    expect(capabilities.capabilities.token_usage).not.toBe("native");
    expect(capabilities.capabilities.context_usage).not.toBe("native");
    expect(capabilities.capabilities.stdin).toBe(true);
    expectCapabilityEvidence(capabilities);
  });

  test("Claude Code declares native hook lifecycle and non-native total session token usage", () => {
    const capabilities = claudeCodeCapabilities();

    expect(capabilities.provider).toBe("claude_code");
    expect(capabilities.supported_provider_versions).toEqual(expect.arrayContaining([
      expect.stringContaining("claude")
    ]));
    expect(capabilities.capabilities.session_lifecycle).toBe("native");
    expect(capabilities.capabilities.tool_lifecycle).toBe("native");
    expect(capabilities.capabilities.token_usage).not.toBe("native");
    expect(capabilities.capabilities.stdin).toBe(true);
    expectCapabilityEvidence(capabilities);
  });
});

function expectCapabilityEvidence(capabilities: {
  readonly capabilities: Readonly<Record<string, unknown>>;
  readonly capability_evidence: Readonly<Record<string, readonly string[]>>;
}): void {
  expect(Object.keys(capabilities.capability_evidence).sort()).toEqual(Object.keys(capabilities.capabilities).sort());

  for (const [capability, evidenceRefs] of Object.entries(capabilities.capability_evidence)) {
    expect(capability).toBeTruthy();
    expect(evidenceRefs.length).toBeGreaterThan(0);
    for (const ref of evidenceRefs) {
      expect(ref).toMatch(/^(docs|src|tests)\//);
    }
  }
}
