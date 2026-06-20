# Adapter Contract Reference

## Required outputs

- `RawHookEvent`: immutable raw event or raw event reference.
- `NormalizedEvent`: `bmh.event.v1` envelope.
- `AdapterCapabilityMatrix`: supported events, metrics, transports, IDs, timestamps, and confidence.

## Minimum mapping checklist

- Provider name and provider event type.
- Canonical event type.
- Run, trial, session, and turn identifiers when available.
- Timestamps: native if available, observed otherwise.
- Action category and status.
- Raw payload hash.
- Redaction status.
- Data quality fields.

## Capability values

Use:

- `native`: directly exposed by provider.
- `derived`: reconstructed from events or artifacts.
- `estimated`: approximated by tokenizer/parser/heuristic.
- `partial`: available for some cases only.
- `unavailable`: not available.
- `unknown`: not verified.

## Completion criteria

- Raw fixture parses successfully.
- Golden canonical event is stable.
- Duplicate raw event dedupes by idempotency key.
- Secret fixture is redacted.
- Missing field fixture produces a valid event with degraded `quality`.
