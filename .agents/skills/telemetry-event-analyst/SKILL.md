---
name: telemetry-event-analyst
description: Analyze Bench My Harness normalized events, raw hook references, metric observations, token usage, context window usage, tool calls, command execution, outputs, benchmark run artifacts, and harness comparison reports.
---

# Telemetry Event Analyst

## Workflow

1. Identify baseline, candidate, benchmark version, harness profiles, and trial counts.
2. Read `references/metrics-policy.md` before interpreting tokens, context, or cost.
3. Verify comparability: same scenario, initial state, model policy, permissions, environment, and adapter capabilities.
4. Separate functional failure from performance regression and telemetry gaps.
5. Report absolute values, deltas, source/confidence, variance, and outliers.
6. Link conclusions to event IDs, artifact paths, or metric observation IDs.

## Rules

- Do not compare native token usage with estimated token usage as if they were equivalent.
- Do not hide inconclusive, failed, or missing-data trials.
- Mark runs as `limited` or `not_comparable` when capabilities differ materially.
- Prefer median and distribution over single-run anecdotes.
- Keep raw evidence available for audit.

## Analysis Outputs

Produce concise findings with:

- result summary;
- comparability status;
- biggest deltas;
- data quality gaps;
- likely causes;
- recommended next measurement or fix.
