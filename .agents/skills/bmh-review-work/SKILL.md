---
name: bmh-review-work
description: Always use when reviewing, validating, auditing, or summarizing completed Bench My Harness work, including code changes, tests, docs, ADRs, schemas, adapters, CLI behavior, benchmark runner behavior, or pull-request style review. Enforces TDD acceptance criteria, hexagonal architecture, v1 Codex/Claude Code scope, redaction, source confidence, and quality gates before work is considered done.
---

# BMH Review Work

## Workflow

1. Review as a code reviewer first: findings before summary, ordered by severity, with file and line references.
2. Read `references/review-gates.md` before judging completeness.
3. Check whether the change was driven by tests. New behavior without tests is a finding.
4. Verify hexagonal boundaries: domain must not import adapters, CLI, filesystem, process APIs, or provider-specific schemas.
5. Verify v1 scope: only Codex and Claude Code adapters are production scope.
6. Verify observability integrity: tokens, context, and cost must carry source and confidence.
7. Verify security: secrets are redacted before reports; raw payload handling is explicit.
8. Run or report verification commands. If commands fail, include the exact failure category.

## Review Rules

- Lead with bugs, risks, missing tests, and spec violations.
- Treat missing acceptance coverage as a blocker for new behavior.
- Do not accept "works manually" as benchmark evidence.
- Do not accept global user config mutation for hook installation.
- Do not accept metrics without `measurement_source`, `capture_source`, and `confidence`.
- Do not accept provider-specific data in domain models.
- Do not accept Cursor/OpenCode/Pi implementation as v1 production scope without a new ADR.

## Required Output

Use this structure:

1. Findings
2. Open questions or assumptions
3. Verification run
4. Change summary

If there are no findings, say that clearly and identify any residual risk or unrun verification.
