---
name: benchmark-spec-author
description: Create, review, or update Bench My Harness benchmark scenarios, suites, prompts, fixtures, expected outputs, validation commands, scoring rubrics, reproducibility metadata, and benchmark YAML or JSON contracts.
---

# Benchmark Spec Author

## Workflow

1. Identify the behavior being measured and the risk the benchmark covers.
2. Read `references/benchmark-contract.md` before changing benchmark schemas.
3. Prefer deterministic validations: tests, typecheck, lint, structured diffs, and executable checks.
4. Version prompt, repo state, setup, limits, permissions, model policy, network policy, and expected outputs.
5. Separate scenario definition from harness execution details.
6. Add fixtures and validation tests for new schema behavior.

## Rules

- Do not define a benchmark without a fixed initial state.
- Do not use subjective semantic scoring without an explicit rubric.
- Do not change thresholds to make a failing run pass.
- Record any external dependency and provide a local fallback when practical.
- Multiple trials are required before making strong claims about harness quality.

## Output Shape

For a new benchmark, provide:

- scenario id, name, category, difficulty, tags;
- repo or fixture source;
- prompt text and constraints;
- setup and validation commands;
- limits for time, tokens, cost, and permissions;
- expected outputs and forbidden changes;
- scoring weights;
- metadata needed for reproduction.
