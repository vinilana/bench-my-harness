---
name: adr-architecture-writer
description: Write, review, or update Bench My Harness architecture decision records for hexagonal architecture, event schemas, benchmark protocol, adapter strategy, storage, security, comparability, metrics, or execution isolation.
---

# ADR Architecture Writer

## Workflow

1. Identify the decision that needs a durable record.
2. Read `references/adr-template.md` before adding or changing ADRs.
3. Keep one decision per ADR.
4. State context, decision, consequences, alternatives, and validation impact.
5. Cross-link related specs when the decision affects contracts or behavior.
6. Update status instead of rewriting history when a decision changes.

## Rules

- Use sequential filenames: `NNN-short-title.md`.
- Prefer `Proposta`, `Aceita`, `Substituida`, or `Rejeitada` for status.
- Do not bury unresolved tradeoffs in prose; list them directly.
- Record consequences for adapters, tests, data migration, and user-facing behavior.
- If the ADR affects schemas, mention versioning and reprocessing impact.

## Review Checklist

- The decision is explicit.
- The rejected alternatives are clear enough to prevent reopening the same debate.
- The consequences include at least one downside.
- The validation plan is actionable.
- The ADR does not depend on provider-specific behavior unless the decision is about an adapter.
