import type { Benchmark } from "../../../domain/benchmark/benchmark-schema.js";
import type { BenchmarkStoreKey, BenchmarkStorePort } from "../../../application/ports/benchmark-store.js";

export class InMemoryBenchmarkStore implements BenchmarkStorePort {
  private readonly records = new Map<string, Benchmark>();

  public async save(benchmark: Benchmark): Promise<Benchmark> {
    const copy = clone(benchmark);
    this.records.set(keyOf(copy), copy);
    return clone(copy);
  }

  public async find(key: BenchmarkStoreKey): Promise<Benchmark | undefined> {
    const benchmark = this.records.get(`${key.id}@${key.version}`);
    return benchmark ? clone(benchmark) : undefined;
  }

  public async list(): Promise<Benchmark[]> {
    return Array.from(this.records.values(), clone);
  }
}

function keyOf(benchmark: Benchmark): string {
  return `${benchmark.id}@${benchmark.version}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
