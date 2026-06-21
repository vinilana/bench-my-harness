import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { FilesystemSpecCatalogStore } from "../../src/adapters/outbound/filesystem/filesystem-spec-catalog-store.js";
import { LoadSpecCatalogUseCase } from "../../src/application/use-cases/load-spec-catalog.js";

describe("filesystem spec catalog loader", () => {
  test("loads suite specs and resolves benchmark and prompt paths from the catalog root", async () => {
    const catalogRoot = resolve("tests/fixtures/spec-catalogs/valid/.bmh/specs");

    const loaded = await new LoadSpecCatalogUseCase(new FilesystemSpecCatalogStore()).execute({ catalogRoot });

    expect(loaded.catalog.id).toBe("core-regression-suite");
    expect(loaded.specs).toHaveLength(1);
    expect(loaded.specs[0]).toMatchObject({
      id: "login-validation",
      tags: ["auth", "bugfix"],
      catalogPath: "cases/login-validation/benchmark.json",
      caseDirectory: resolve(catalogRoot, "cases/login-validation"),
      benchmark: {
        id: "login-validation",
        prompt: {
          file: "spec.md"
        }
      }
    });
    expect(loaded.specs[0]?.promptMarkdown).toContain("Reject invalid email addresses");
  });

  test("rejects suite entries that escape the catalog root", async () => {
    const catalogRoot = resolve("tests/fixtures/spec-catalogs/traversal-suite/.bmh/specs");

    await expect(new LoadSpecCatalogUseCase(new FilesystemSpecCatalogStore()).execute({ catalogRoot })).rejects.toThrow(
      /traversal|outside|catalog|escape/i
    );
  });

  test("rejects prompt files that escape the feature directory", async () => {
    const catalogRoot = resolve("tests/fixtures/spec-catalogs/traversal-prompt/.bmh/specs");

    await expect(new LoadSpecCatalogUseCase(new FilesystemSpecCatalogStore()).execute({ catalogRoot })).rejects.toThrow(
      /prompt|traversal|outside|escape/i
    );
  });
});
