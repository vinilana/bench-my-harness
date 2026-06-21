# Prompt: Initialize Bench My Harness Specs

Use this prompt with a coding agent inside an existing repository to create or update a Bench My Harness spec catalog.

```text
You are working in this repository. Initialize a Bench My Harness spec catalog for features that already exist in the project.

Goal:
- Create or update `.bmh/specs/suite.json`.
- Create benchmark specs under `.bmh/specs/cases/<spec-id>/`.
- Use existing documentation, specs, tickets, commit history, tests, and source code as evidence.
- Prefer deterministic validation commands such as tests, typecheck, lint, and build.
- Make the catalog ready for:
  `bench-my-harness check`
  `bench-my-harness run --dry-run --harness codex --harness claude_code`

Rules:
- Use the Bench My Harness CLI when available. Do not hand-write files that the CLI can create.
- Keep `.bmh/specs/**` versionable, but do not commit `.bmh/runs`, `.bmh/workspaces`, `.bmh/golden`, or benchmark outputs.
- Every spec must have a fixed `base_ref` and, when the feature already exists, a `golden_ref`.
- Every spec prompt must be a Markdown file copied into `.bmh/specs/cases/<spec-id>/spec.md`.
- Generated Git cases are a secondary option when written specs are unavailable. Keep their generated-source and bias metadata intact.
- Do not invent product requirements that are not supported by docs, tests, commit messages, or code evidence.
- Do not call real Codex or Claude Code during setup. Use dry-run validation only.
- Preserve existing user changes. Do not reset, checkout, or remove unrelated files.

Suggested workflow:

1. Build the project so the CLI exists:
   `npm run build`

2. Initialize the catalog:
   `node ./dist/adapters/inbound/cli/main.js init`

3. Configure authoring defaults once for this repository:
   `node ./dist/adapters/inbound/cli/main.js init --repo-path . --category feature --setup-command "<setup command>" --test-command "<validation command>" --harness codex --harness claude_code --trials 3 --include-in-suite`

4. Identify 3 to 10 good benchmark candidates:
   - features with clear docs or specs;
   - features with deterministic tests;
   - changes with a clear before and after commit;
   - small to medium tasks that an agent can reasonably re-implement.

5. For each candidate with an existing Markdown requirement/spec, run:
   `node ./dist/adapters/inbound/cli/main.js add <path-to-requirement.md> --base-ref <commit-before-feature> --golden-ref <commit-after-feature>`

6. To create several specs from Markdown requirements with the same refs, run:
   `node ./dist/adapters/inbound/cli/main.js add "docs/specs/*.md" --base-ref <commit-before-feature> --golden-ref <commit-after-feature>`

7. For each candidate that only has Git history evidence, run:
   `node ./dist/adapters/inbound/cli/main.js add --from-git --include-in-suite --id <spec-id> --name "<Human name>" --category <feature|bugfix|refactor> --repo-path . --base-ref <commit-before-feature> --golden-ref <commit-after-feature> --test-command "<validation command>"`

8. For bulk generated Git case creation from recent history, use a conservative limit:
   `node ./dist/adapters/inbound/cli/main.js add --from-git --repo-path . --range <base>..<head> --limit 25`

9. Validate the catalog:
   `node ./dist/adapters/inbound/cli/main.js check`

10. Run a dry benchmark check and render the HTML report:
   `node ./dist/adapters/inbound/cli/main.js run --dry-run --run-id specs_dry_run`

11. Review the generated files:
   - `.bmh/specs/suite.json`
   - `.bmh/specs/cases/*/spec.md`
   - `.bmh/specs/cases/*/benchmark.json`

Acceptance criteria:
- `bench-my-harness check` passes.
- Dry-run suite execution completes.
- `.bmh/runs/<run-id>/report.html` is generated.
- Specs include fixed repo refs, setup commands, validation commands, limits, expected outputs, and metadata.
- Generated Git cases are clearly marked with `source = "generated_git"` and `prompt_mode = "behavior_summary"`.
- The final summary lists created cases, source evidence, validation commands, and whether cases were written specs or generated from Git.
```
