---
name: harness-adapter-designer
description: Design, implement, or review Bench My Harness adapters for agentic coding harness hooks, plugins, extensions, transcripts, JSONL logs, stdin events, or webhooks from Codex, Claude Code, Cursor, OpenCode, Pi, or custom harnesses.
---

# Harness Adapter Designer

## Workflow

1. Identify the provider surface: hook, plugin, extension, SDK stream, transcript, JSONL file, webhook, or process wrapper.
2. Read `references/adapter-contract.md` before designing the adapter contract or changing mappings.
3. Map provider events to `bmh.event.v1` without leaking provider-specific fields into the core.
4. Preserve raw payload by `raw_ref`, apply redaction, and mark missing or inferred data in `quality`.
5. Declare the adapter capability matrix before using its data for comparison.
6. Add contract fixtures: raw input, golden canonical output, idempotency case, redaction case, and incomplete event case.

## Rules

- Keep provider SDKs and schemas in adapters only.
- Do not invent native IDs, timestamps, token usage, or context usage. Mark inferred values as `derived`, `estimated`, or `observed`.
- Local hooks must be fast and tolerate network failure through local spool or best-effort persistence.
- Webhooks must use signature verification, replay protection, and size limits.
- A new adapter is not complete until it declares capabilities and known gaps.

## Common Tasks

- For Claude Code or Codex hooks, prefer stdin command adapters first.
- For OpenCode, prefer plugin or SDK event stream adapters.
- For Pi, prefer extension or SDK adapters.
- For Cursor, start with official hooks when available in the target environment and keep file/transcript fallback.
- For unknown harnesses, implement file/JSONL import before custom runtime control.
