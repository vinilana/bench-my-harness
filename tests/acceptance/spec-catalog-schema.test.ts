import { describe, expect, test } from "vitest";
import { SpecCatalogSchema } from "../../src/domain/benchmark/benchmark-schema.js";
import validSuite from "../fixtures/spec-catalogs/valid/.bmh/specs/suite.json" with { type: "json" };

describe("spec catalog suite schema", () => {
  test("accepts a versioned suite with supported v1 harness defaults", () => {
    const suite = SpecCatalogSchema.parse(validSuite);

    expect(suite).toMatchObject({
      id: "core-regression-suite",
      name: "Core regression suite",
      version: "1.0.0",
      defaults: {
        trials: 2,
        harnesses: ["codex", "claude_code"],
        workspace_root: ".bmh/workspaces",
        strict_telemetry: false
      }
    });
    expect(suite.specs).toEqual([
      {
        id: "login-validation",
        path: "features/login-validation/benchmark.json",
        tags: ["auth", "bugfix"]
      }
    ]);
  });

  test("accepts an initialized empty suite while requiring the specs array", () => {
    const suite = SpecCatalogSchema.parse({
      id: "local-specs",
      name: "Local specs",
      version: "1.0.0",
      specs: []
    });

    expect(suite.specs).toEqual([]);
  });

  test("rejects suites missing required identity fields", () => {
    expect(() =>
      SpecCatalogSchema.parse({
        id: "missing-name",
        version: "1.0.0",
        specs: []
      })
    ).toThrow();
  });

  test("rejects unsupported default harnesses", () => {
    expect(() =>
      SpecCatalogSchema.parse({
        ...validSuite,
        defaults: {
          ...validSuite.defaults,
          harnesses: ["codex", "cursor"]
        }
      })
    ).toThrow();
  });

  test("rejects non-positive trial defaults", () => {
    expect(() =>
      SpecCatalogSchema.parse({
        ...validSuite,
        defaults: {
          ...validSuite.defaults,
          trials: 0
        }
      })
    ).toThrow();
  });
});
