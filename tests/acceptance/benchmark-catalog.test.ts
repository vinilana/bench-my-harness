import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FilesystemBenchmarkStore } from "../../src/adapters/outbound/storage/filesystem-benchmark-store.js";
import { InMemoryBenchmarkStore } from "../../src/adapters/outbound/storage/in-memory-benchmark-store.js";
import { RegisterBenchmarkUseCase } from "../../src/application/use-cases/register-benchmark.js";
import benchmark from "../fixtures/benchmarks/login-validation.benchmark.json" with { type: "json" };

describe("benchmark catalog", () => {
  test("registers immutable versioned benchmarks in memory", async () => {
    const store = new InMemoryBenchmarkStore();
    const useCase = new RegisterBenchmarkUseCase(store);

    const registered = await useCase.execute(benchmark);

    expect(registered.id).toBe("login-validation-001");
    await expect(store.find({ id: "login-validation-001", version: "1.0.0" })).resolves.toEqual(registered);
    await expect(useCase.execute(benchmark)).rejects.toMatchObject({ code: "benchmark_already_exists" });
  });

  test("persists registered benchmarks in a filesystem catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "bmh-benchmark-catalog-"));
    const store = new FilesystemBenchmarkStore({ root });
    const useCase = new RegisterBenchmarkUseCase(store);

    await useCase.execute(benchmark);
    const reopened = new FilesystemBenchmarkStore({ root });

    await expect(reopened.find({ id: "login-validation-001", version: "1.0.0" })).resolves.toMatchObject({
      id: "login-validation-001",
      version: "1.0.0"
    });
    await expect(reopened.list()).resolves.toHaveLength(1);
  });
});
