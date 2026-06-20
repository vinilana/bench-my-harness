# Metrics Policy Reference

## Measurement sources

- `native`: reported by harness or provider.
- `observed`: measured by Bench My Harness.
- `estimated`: estimated by tokenizer or parser.
- `derived`: calculated from normalized events.
- `unavailable`: missing.

## Required metric metadata

- metric name;
- value and unit;
- measurement source;
- confidence;
- run id and trial id;
- provider and adapter version;
- supporting event or artifact references.

## Comparability status

- `comparable`: important dimensions match.
- `limited`: useful comparison with explicit caveats.
- `not_comparable`: capabilities or setup invalidate the comparison.

## Common caveats

- Different model or provider.
- Different tool permissions.
- Missing token data.
- Estimated context window usage.
- Flaky tests.
- Environment or setup failure.
- Adapter version changed.
