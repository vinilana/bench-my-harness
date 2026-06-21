import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SpecCatalogStore } from "../../../application/ports/spec-catalog-store.js";
import type { SpecCatalog } from "../../../domain/benchmark/benchmark-schema.js";
import {
  addSpecToCatalog,
  createSpecCatalog,
  parseFeatureBenchmark,
  parseSpecCatalog,
  validateSpecCatalogPath,
  type FeatureSpecDraft,
  type LoadedSpecCatalog,
  type SpecCatalogDefaults
} from "../../../domain/benchmark/spec-catalog.js";

export class FilesystemSpecCatalogStore implements SpecCatalogStore {
  public async createCatalog(input: {
    catalogRoot: string;
    catalog: SpecCatalog;
    force?: boolean;
  }): Promise<SpecCatalog> {
    await mkdir(input.catalogRoot, { recursive: true });
    await writeJson(this.suitePath(input.catalogRoot), input.catalog, input.force === true ? "w" : "wx");
    return input.catalog;
  }

  public async loadCatalog(input: { catalogRoot: string }): Promise<LoadedSpecCatalog> {
    const catalog = parseSpecCatalog(await readJson(this.suitePath(input.catalogRoot)));
    const specs = await Promise.all(
      catalog.specs.map(async (reference) => {
        const catalogPath = validateSpecCatalogPath(reference.path);
        const benchmarkPath = join(input.catalogRoot, catalogPath);
        const benchmark = parseFeatureBenchmark(await readJson(benchmarkPath));
        const promptFile = benchmark.prompt.file;

        if (promptFile === undefined) {
          throw new Error(`catalog spec ${reference.id} must use prompt.file`);
        }

        const promptPath = validateSpecCatalogPath(`${dirname(catalogPath)}/${promptFile}`, "prompt.file");
        const promptMarkdown = await readFile(join(input.catalogRoot, promptPath), "utf8");

        if (promptMarkdown.trim().length === 0) {
          throw new Error(`prompt file is empty for spec ${reference.id}`);
        }

        return {
          id: reference.id,
          tags: reference.tags ?? benchmark.tags ?? [],
          catalogPath,
          caseDirectory: dirname(benchmarkPath),
          benchmark,
          promptMarkdown
        };
      })
    );

    return { catalog, specs };
  }

  public async updateDefaults(input: {
    catalogRoot: string;
    defaults: SpecCatalogDefaults;
  }): Promise<SpecCatalog> {
    let catalog: SpecCatalog;

    try {
      catalog = parseSpecCatalog(await readJson(this.suitePath(input.catalogRoot)));
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }

      catalog = createSpecCatalog();
    }

    const updated = parseSpecCatalog({
      ...catalog,
      defaults: {
        ...(catalog.defaults ?? {}),
        ...definedDefaults(input.defaults)
      }
    });

    await writeJsonAtomic(this.suitePath(input.catalogRoot), updated);
    return updated;
  }

  public async writeFeatureSpec(input: {
    catalogRoot: string;
    draft: FeatureSpecDraft;
    includeInSuite?: boolean;
    force?: boolean;
  }): Promise<FeatureSpecDraft> {
    const specPath = join(input.catalogRoot, validateSpecCatalogPath(input.draft.specPath));
    const benchmarkPath = join(input.catalogRoot, validateSpecCatalogPath(input.draft.benchmarkPath));
    const flag = input.force === true ? "w" : "wx";

    await mkdir(dirname(specPath), { recursive: true });
    await writeFile(specPath, input.draft.specMarkdown, { encoding: "utf8", flag });
    await writeJson(benchmarkPath, input.draft.benchmark, flag);

    if (input.includeInSuite === true) {
      await this.upsertSuiteReference(input.catalogRoot, input.draft);
    }

    return input.draft;
  }

  private async upsertSuiteReference(catalogRoot: string, draft: FeatureSpecDraft): Promise<void> {
    const suitePath = this.suitePath(catalogRoot);
    const catalog = await this.readOrCreateCatalog(suitePath);

    await mkdir(catalogRoot, { recursive: true });
    await writeJson(suitePath, addSpecToCatalog(catalog, draft.suiteReference), "w");
  }

  private suitePath(catalogRoot: string): string {
    return join(catalogRoot, "suite.json");
  }

  private async readOrCreateCatalog(path: string): Promise<SpecCatalog> {
    try {
      return parseSpecCatalog(await readJson(path));
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }

      return createSpecCatalog();
    }
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function writeJson(path: string, value: unknown, flag: "w" | "wx"): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag });
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  await rename(temporaryPath, path);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function definedDefaults(defaults: SpecCatalogDefaults): SpecCatalogDefaults {
  return Object.fromEntries(
    Object.entries(defaults).filter(([, value]) => value !== undefined)
  ) as SpecCatalogDefaults;
}
