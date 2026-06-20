import type { Benchmark } from "../../domain/benchmark/benchmark-schema.js";

export interface BenchmarkStoreKey {
  id: string;
  version: string;
}

export interface BenchmarkStorePort {
  save(benchmark: Benchmark): Promise<Benchmark>;
  find(key: BenchmarkStoreKey): Promise<Benchmark | undefined>;
  list(): Promise<Benchmark[]>;
}
