import { describe, expect, test } from "vitest";

import { SpecCatalogSchema } from "../../src/domain/benchmark/benchmark-schema.js";

describe("spec catalog suite defaults", () => {
  test("validates extended suite defaults used for convention authoring", () => {
    const suite = SpecCatalogSchema.parse({
      id: "local-specs",
      name: "Local specs",
      version: "1.0.0",
      specs: [],
      defaults: {
        repo_path: ".",
        category: "feature",
        trials: 3,
        harnesses: ["codex", "claude_code"],
        workspace_root: ".bmh/workspaces",
        strict_telemetry: false,
        setup_commands: ["npm install"],
        test_commands: ["npm test", "npm run typecheck", "npm run build"],
        include_in_suite: true
      }
    });

    expect(suite.defaults).toEqual({
      repo_path: ".",
      category: "feature",
      trials: 3,
      harnesses: ["codex", "claude_code"],
      workspace_root: ".bmh/workspaces",
      strict_telemetry: false,
      setup_commands: ["npm install"],
      test_commands: ["npm test", "npm run typecheck", "npm run build"],
      include_in_suite: true
    });
  });

  test("rejects unsupported default harnesses", () => {
    expect(() =>
      SpecCatalogSchema.parse({
        id: "local-specs",
        name: "Local specs",
        version: "1.0.0",
        specs: [],
        defaults: {
          harnesses: ["codex", "cursor"]
        }
      })
    ).toThrow();
  });

  test("rejects non-positive default trials", () => {
    expect(() =>
      SpecCatalogSchema.parse({
        id: "local-specs",
        name: "Local specs",
        version: "1.0.0",
        specs: [],
        defaults: {
          trials: 0
        }
      })
    ).toThrow();
  });

  test("accepts setup and validation command defaults in order", () => {
    const suite = SpecCatalogSchema.parse({
      id: "local-specs",
      name: "Local specs",
      version: "1.0.0",
      specs: [],
      defaults: {
        setup_commands: ["corepack enable", "pnpm install --frozen-lockfile"],
        test_commands: ["pnpm test", "pnpm typecheck", "pnpm build"]
      }
    });

    expect(suite.defaults?.setup_commands).toEqual(["corepack enable", "pnpm install --frozen-lockfile"]);
    expect(suite.defaults?.test_commands).toEqual(["pnpm test", "pnpm typecheck", "pnpm build"]);
  });
});
