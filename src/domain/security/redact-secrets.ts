import { createHash } from "node:crypto";

export interface RedactionFinding {
  readonly kind: string;
  readonly hash: `sha256:${string}`;
}

export interface RedactionResult {
  readonly redacted: string;
  readonly redactionApplied: boolean;
  readonly originalHash: `sha256:${string}`;
  readonly findings: readonly RedactionFinding[];
}

type Replacement =
  | string
  | ((match: string, ...captures: string[]) => string);

interface RedactionRule {
  readonly kind: string;
  readonly pattern: RegExp;
  readonly replacement: Replacement;
}

const REDACTED = "[REDACTED]";

const SECRET_RULES: readonly RedactionRule[] = [
  {
    kind: "private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: REDACTED
  },
  {
    kind: "authorization_header",
    pattern: /(Authorization\s*[:=]\s*(?:Bearer|Basic)\s+)([^\s'",\\]+)/gi,
    replacement: (_match, prefix: string) => `${prefix}${REDACTED}`
  },
  {
    kind: "cookie_header",
    pattern: /(Cookie\s*[:=]\s*)([^'",\\\n]+)/gi,
    replacement: (_match, prefix: string) => `${prefix}${REDACTED}`
  },
  {
    kind: "api_key",
    pattern: /\b(sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]*api[_-]?key[A-Za-z0-9_-]*\s*[:=]\s*)[A-Za-z0-9_./+=-]{8,}/gi,
    replacement: (match) => {
      const assignment = match.match(/^(.+?[:=]\s*)/);
      return assignment ? `${assignment[1]}${REDACTED}` : REDACTED;
    }
  },
  {
    kind: "oauth_or_jwt",
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    replacement: REDACTED
  },
  {
    kind: "env_assignment",
    pattern: /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*)([^\s'",\\]+)/g,
    replacement: (_match, prefix: string) => `${prefix}${REDACTED}`
  }
];

export function redactSecrets(input: string): RedactionResult {
  const findings: RedactionFinding[] = [];
  let redacted = input;

  for (const rule of SECRET_RULES) {
    redacted = redacted.replace(rule.pattern, (match: string, ...captures: string[]) => {
      findings.push({ kind: rule.kind, hash: sha256(match) });

      if (typeof rule.replacement === "function") {
        return rule.replacement(match, ...captures);
      }

      return rule.replacement;
    });
  }

  return {
    redacted,
    redactionApplied: findings.length > 0,
    originalHash: sha256(input),
    findings
  };
}

export function sha256(input: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}
