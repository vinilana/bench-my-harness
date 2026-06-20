# Benchmark Contract Reference

## Required fields

- `id`
- `name`
- `version`
- `category`
- `repo` or `fixture`
- `prompt.text`
- `expected_output`
- `limits`
- `evaluation`

## Recommended fields

- `difficulty`
- `tags`
- `prompt.constraints`
- `repo.commit`
- `repo.setup_commands`
- `repo.test_commands`
- `permissions`
- `network_policy`
- `model_policy`
- `metadata.created_by`

## Validation priority

1. Deterministic tests.
2. Typecheck, lint, static validation.
3. File and diff constraints.
4. Semantic requirements with explicit rubric.
5. LLM evaluation marked as subjective.

## Failure categories

- `agent_failed`
- `environment_failed`
- `timeout`
- `budget_exceeded`
- `adapter_failed`
- `inconclusive`
