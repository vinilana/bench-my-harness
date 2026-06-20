---
name: bmh-plan-work
description: Always use when planning, designing, scoping, estimating, or proposing any Bench My Harness feature, refactor, adapter, schema, CLI command, benchmark behavior, test suite, ADR, or implementation approach. Enforces Spec Driven Development, TDD-first planning, hexagonal architecture boundaries, v1 Codex/Claude Code scope, and explicit acceptance criteria before code changes.
---

# BMH Plan Work

## Workflow

1. Identify the smallest valuable change and classify it: domain, application use case, adapter, CLI, storage, schema, tests, docs, or ADR.
2. Read the relevant specs/ADRs before proposing code. Use `references/planning-gates.md` to choose required documents.
3. State whether existing specs/ADRs are sufficient. If behavior is new or changes architecture, update docs before implementation.
4. Define acceptance criteria as tests first. Name the expected test files and fixtures.
5. Preserve hexagonal boundaries: domain has no provider, filesystem, CLI, process, or framework imports.
6. Keep v1 scope to Codex and Claude Code unless an explicit ADR changes scope.
7. Identify risks: observability gaps, token/context source confidence, redaction, global config mutation, hook latency, idempotency, and comparability.
8. Only then outline implementation steps.

## Planning Rules

- Do not plan production code before defining the failing tests.
- Do not introduce a dependency without naming why local patterns or standard APIs are insufficient.
- Do not let Codex or Claude Code raw schemas leak into domain models.
- Do not create broad refactors during feature work unless required by the acceptance criteria.
- Do not promise native token/context data unless the source proves it.
- Prefer fake harnesses and local fixtures over real Codex/Claude execution in tests.

## Required Output

Every plan must include:

- relevant specs/ADRs consulted;
- acceptance tests to add or update;
- affected ports/use cases/adapters;
- data/source confidence implications;
- implementation sequence;
- verification commands.
