import { describe, expect, test } from "vitest";
import { redactSecrets } from "../../src/domain/security/redact-secrets.js";

describe("security redaction", () => {
  test("redacts API keys, authorization headers, cookies, JWTs, private keys, and env assignments", () => {
    const input = [
      "OPENAI_API_KEY=sk-test-1234567890",
      "Authorization: Bearer secret-token",
      "Cookie: sessionid=secret-cookie",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
      "-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----"
    ].join("\n");

    const result = redactSecrets(input);

    expect(result.redacted).not.toContain("sk-test-1234567890");
    expect(result.redacted).not.toContain("secret-token");
    expect(result.redacted).not.toContain("secret-cookie");
    expect(result.redacted).not.toContain("PRIVATE KEY");
    expect(result.redacted).toContain("[REDACTED]");
    expect(result.redactionApplied).toBe(true);
  });

  test("returns an audit hash for the original payload", () => {
    const result = redactSecrets("OPENAI_API_KEY=sk-test-1234567890");

    expect(result.originalHash).toMatch(/^sha256:/);
  });
});
