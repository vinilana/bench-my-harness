import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BenchmarkSchema, type Benchmark } from "../../../domain/benchmark/benchmark-schema.js";
import type { BenchmarkStoreKey, BenchmarkStorePort } from "../../../application/ports/benchmark-store.js";

export class FilesystemBenchmarkStore implements BenchmarkStorePort {
  public constructor(private readonly options: { root: string }) {}

  public async save(benchmark: Benchmark): Promise<Benchmark> {
    const path = this.pathFor({ id: benchmark.id, version: benchmark.version });
    await mkdir(join(this.options.root, benchmark.id), { recursive: true });
    await writeFile(path, `${JSON.stringify(benchmark, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return benchmark;
  }

  public async find(key: BenchmarkStoreKey): Promise<Benchmark | undefined> {
    try {
      return BenchmarkSchema.parse(JSON.parse(await readFile(this.pathFor(key), "utf8")));
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  public async list(): Promise<Benchmark[]> {
    const ids = await readDirIfExists(this.options.root);
    const benchmarks = await Promise.all(
      ids.map(async (id) => {
        const versions = await readDirIfExists(join(this.options.root, id));
        return Promise.all(
          versions
            .filter((versionFile) => versionFile.endsWith(".json"))
            .map((versionFile) => this.find({ id, version: versionFile.replace(/\.json$/, "") }))
        );
      })
    );

    return benchmarks.flat().filter((benchmark): benchmark is Benchmark => benchmark !== undefined);
  }

  private pathFor(key: BenchmarkStoreKey): string {
    return join(this.options.root, key.id, `${key.version}.json`);
  }
}

async function readDirIfExists(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
