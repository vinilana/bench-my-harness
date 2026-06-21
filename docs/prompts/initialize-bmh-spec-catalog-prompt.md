# Prompt: Initialize Bench My Harness Specs

Use this prompt with a coding agent inside an existing repository to create or update a Bench My Harness spec catalog.

```text
You are working in this repository. Initialize a Bench My Harness spec catalog for features that already exist in the project.

Goal:
- Create or update `.bmh/specs/suite.json`.
- Create benchmark specs under `.bmh/specs/features/<spec-id>/`.
- Use existing documentation, specs, tickets, commit history, tests, and source code as evidence.
- Prefer deterministic validation commands such as tests, typecheck, lint, and build.
- Make the catalog ready for:
  `bench-my-harness specs validate`
  `bench-my-harness specs run --dry-run --harness codex --harness claude_code`

Rules:
- Use the Bench My Harness CLI when available. Do not hand-write files that the CLI can create.
- Keep `.bmh/specs/**` versionable, but do not commit `.bmh/runs`, `.bmh/workspaces`, `.bmh/golden`, or benchmark outputs.
- Every spec must have a fixed `base_ref` and, when the feature already exists, a `golden_ref`.
- Every spec prompt must be a Markdown file copied into `.bmh/specs/features/<spec-id>/spec.md`.
- Backward-generated specs from Git history are drafts. Mark them as needing human review unless the source requirements are explicit.
- Do not invent product requirements that are not supported by docs, tests, commit messages, or code evidence.
- Do not call real Codex or Claude Code during setup. Use dry-run validation only.
- Preserve existing user changes. Do not reset, checkout, or remove unrelated files.

Suggested workflow:

1. Build the project so the CLI exists:
   `npm run build`

2. Initialize the catalog:
   `node ./dist/adapters/inbound/cli/main.js specs init`

3. Identify 3 to 10 good benchmark candidates:
   - features with clear docs or specs;
   - features with deterministic tests;
   - changes with a clear before and after commit;
   - small to medium tasks that an agent can reasonably re-implement.

4. For each candidate with an existing Markdown requirement/spec, run:
   `node ./dist/adapters/inbound/cli/main.js specs create --include-in-suite --id <spec-id> --name "<Human name>" --category <feature|bugfix|refactor> --repo-path . --base-ref <commit-before-feature> --golden-ref <commit-after-feature> --prompt-file <path-to-requirement.md> --setup-command "<setup command>" --test-command "<validation command>"`

5. For each candidate that only has Git history evidence, run:
   `node ./dist/adapters/inbound/cli/main.js specs create --from-git --include-in-suite --id <spec-id> --name "<Human name>" --category <feature|bugfix|refactor> --repo-path . --base-ref <commit-before-feature> --golden-ref <commit-after-feature> --test-command "<validation command>"`

6. For bulk draft creation from recent history, use a conservative limit:
   `node ./dist/adapters/inbound/cli/main.js specs backfill --repo-path . --range <base>..<head> --limit 25`

7. Validate the catalog:
   `node ./dist/adapters/inbound/cli/main.js specs validate`

8. Run a dry benchmark smoke test:
   `node ./dist/adapters/inbound/cli/main.js specs run --dry-run --run-id specs_smoke --harness codex --harness claude_code --trials 1`

9. Render the HTML report:
   `node ./dist/adapters/inbound/cli/main.js report --run-id specs_smoke --format html`

10. Review the generated files:
   - `.bmh/specs/suite.json`
   - `.bmh/specs/features/*/spec.md`
   - `.bmh/specs/features/*/benchmark.json`

Acceptance criteria:
- `bench-my-harness specs validate` passes.
- Dry-run suite execution completes.
- `.bmh/runs/<run-id>/report.html` is generated.
- Specs include fixed repo refs, setup commands, validation commands, limits, expected outputs, and metadata.
- Draft specs are clearly marked as drafts or requiring review.
- The final summary lists created specs, source evidence, validation commands, and any specs that need human review.
```
