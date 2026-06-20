# BMH Review Gates

## Quality gates

- `npm test` passes or failures are expected TDD failures and documented.
- `npm run typecheck` passes or failures are expected TDD failures and documented.
- README and docs match executable behavior.
- New behavior has acceptance tests.
- Fixtures are deterministic and do not require Codex/Claude binaries.

## Architecture gates

- Domain imports no adapter, CLI, filesystem, process, or provider-specific module.
- Application use cases depend on ports, not concrete adapters.
- Codex and Claude Code details stay under adapter modules.
- Raw event preservation remains mandatory before normalization.
- Reprocessing remains possible.

## Benchmark gates

- Trial workspaces are isolated.
- Temporary hooks are installed before harness execution.
- Temporary hooks are removed on success and failure.
- Global user config is never modified.
- Benchmark prompt is passed exactly as defined.

## Observability gates

- Every metric has source and confidence.
- Native and estimated tokens are not silently mixed.
- Missing usage is recorded as unavailable, not invented.
- Coverage/capability gaps are reported.

## Security gates

- Known secrets are redacted before report/export.
- Raw payload retention is explicit.
- Paths are normalized and traversal is rejected.
- Hook failures do not block best-effort benchmark mode.
