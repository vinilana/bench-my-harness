import { BenchmarkSchema, type Benchmark } from "../../domain/benchmark/benchmark-schema.js";
import type { BenchmarkStorePort } from "../ports/benchmark-store.js";

export class BenchmarkAlreadyExistsError extends Error {
  public readonly code = "benchmark_already_exists";

  public constructor(id: string, version: string) {
    super(`Benchmark already exists: ${id}@${version}`);
  }
}

export class RegisterBenchmarkUseCase {
  public constructor(private readonly store: BenchmarkStorePort) {}

  public async execute(input: unknown): Promise<Benchmark> {
    const benchmark = BenchmarkSchema.parse(input);
    const existing = await this.store.find({ id: benchmark.id, version: benchmark.version });

    if (existing) {
      throw new BenchmarkAlreadyExistsError(benchmark.id, benchmark.version);
    }

    return this.store.save(benchmark);
  }
}
