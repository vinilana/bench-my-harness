# BMH Planning Gates

## Always check

- `README.md`
- `docs/specs/02-hexagonal-architecture.md`
- `docs/specs/10-automatic-harness-instrumentation.md`
- `docs/specs/11-tdd-acceptance-test-plan.md`
- `docs/adrs/014-v1-scope-codex-claude-code.md`
- `docs/adrs/015-typescript-node-vitest-stack.md`

## If changing event or metric behavior

- `docs/specs/03-canonical-event-contract.md`
- `docs/specs/05-metrics-and-evaluation.md`
- `docs/specs/09-hook-observability-gap-analysis.md`
- `docs/adrs/002-canonical-event-schema.md`
- `docs/adrs/013-observability-requires-multiple-sources.md`

## If changing adapters or instrumentation

- `docs/specs/06-harness-adapter-spec.md`
- `docs/specs/10-automatic-harness-instrumentation.md`
- `docs/adrs/012-adapter-versioning.md`
- `docs/adrs/014-v1-scope-codex-claude-code.md`

## If changing benchmark execution

- `docs/specs/04-benchmark-model.md`
- `docs/specs/08-initial-roadmap.md`
- `docs/adrs/006-benchmark-protocol.md`
- `docs/adrs/007-harness-execution-isolation.md`

## Plan acceptance checklist

- Tests named before implementation.
- Scope is Codex/Claude Code only for v1.
- New behavior maps to a spec or ADR.
- Provider details stay in adapters.
- Redaction and source confidence are considered.
- Verification commands are explicit.
