import { describe, expect, test } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const FORBIDDEN_NODE_BUILTINS = new Set(["node:fs", "node:fs/promises", "node:path", "node:child_process", "node:http"]);

describe("architecture boundaries", () => {
  test("domain does not import application or adapters", async () => {
    const violations: string[] = [];

    for (const file of await typescriptFiles(join(ROOT, "src", "domain"))) {
      const source = await readFile(file, "utf8");

      for (const specifier of importSpecifiers(source)) {
        if (specifier.includes("/application/") || specifier.includes("/adapters/")) {
          violations.push(`${formatPath(file)} imports ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("application use cases do not import adapters", async () => {
    const violations: string[] = [];

    for (const file of await typescriptFiles(join(ROOT, "src", "application"))) {
      const source = await readFile(file, "utf8");

      for (const specifier of importSpecifiers(source)) {
        if (specifier.includes("/adapters/")) {
          violations.push(`${formatPath(file)} imports ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("domain and application implementation files do not import forbidden Node runtime APIs", async () => {
    const implementationRoots = [
      join(ROOT, "src", "domain"),
      join(ROOT, "src", "application", "use-cases")
    ];
    const violations: string[] = [];

    for (const root of implementationRoots) {
      for (const file of await typescriptFiles(root)) {
        const source = await readFile(file, "utf8");

        for (const specifier of importSpecifiers(source)) {
          if (FORBIDDEN_NODE_BUILTINS.has(specifier)) {
            violations.push(`${formatPath(file)} imports ${specifier}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

async function typescriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);

      if (entry.isDirectory()) {
        return typescriptFiles(path);
      }

      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    })
  );

  return files.flat();
}

function importSpecifiers(source: string): string[] {
  return Array.from(source.matchAll(/import\s+(?:type\s+)?(?:[^"']+\s+from\s+)?["']([^"']+)["']/g), (match) => match[1]);
}

function formatPath(path: string): string {
  return relative(ROOT, path).split(sep).join("/");
}
