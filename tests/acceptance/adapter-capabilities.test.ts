import { describe, expect, test } from "vitest";
import { codexCapabilities } from "../../src/adapters/outbound/harnesses/codex/codex-capabilities.js";
import { claudeCodeCapabilities } from "../../src/adapters/outbound/harnesses/claude-code/claude-code-capabilities.js";

describe("adapter capability matrices", () => {
  test("Codex declares partial tool coverage and non-native token/context usage for hooks", () => {
    const capabilities = codexCapabilities();

    expect(capabilities.provider).toBe("codex");
    expect(capabilities.capabilities.tool_lifecycle).toMatch(/partial|native/);
    expect(capabilities.capabilities.token_usage).not.toBe("native");
    expect(capabilities.capabilities.context_usage).not.toBe("native");
    expect(capabilities.capabilities.stdin).toBe(true);
  });

  test("Claude Code declares native hook lifecycle and non-native total session token usage", () => {
    const capabilities = claudeCodeCapabilities();

    expect(capabilities.provider).toBe("claude_code");
    expect(capabilities.capabilities.session_lifecycle).toBe("native");
    expect(capabilities.capabilities.tool_lifecycle).toBe("native");
    expect(capabilities.capabilities.token_usage).not.toBe("native");
    expect(capabilities.capabilities.stdin).toBe(true);
  });
});
