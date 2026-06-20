import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FilesystemBenchmarkTemplateWriter } from "../../src/adapters/outbound/filesystem/filesystem-benchmark-template-writer.js";
import { BenchmarkSchema, type Benchmark } from "../../src/domain/benchmark/benchmark-schema.js";

describe("filesystem benchmark template writer", () => {
  test("writes pretty JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-template-writer-"));
    const outputPath = join(dir, "template.benchmark.json");

    await new FilesystemBenchmarkTemplateWriter().write({
      outputPath,
      benchmark: benchmarkFixture()
    });

    const raw = await readFile(outputPath, "utf8");
    expect(raw).toContain('\n  "id": "writer-001"');
    expect(raw.endsWith("\n")).toBe(true);
    expect(BenchmarkSchema.parse(JSON.parse(raw))).toMatchObject({ id: "writer-001" });
  });

  test("refuses overwrite by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-template-writer-"));
    const outputPath = join(dir, "template.benchmark.json");
    await writeFile(outputPath, "existing", "utf8");

    await expect(
      new FilesystemBenchmarkTemplateWriter().write({
        outputPath,
        benchmark: benchmarkFixture()
      })
    ).rejects.toThrow(/exists/i);
  });

  test("overwrites when force is enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-template-writer-"));
    const outputPath = join(dir, "template.benchmark.json");
    await writeFile(outputPath, "existing", "utf8");

    await new FilesystemBenchmarkTemplateWriter().write({
      outputPath,
      benchmark: benchmarkFixture(),
      force: true
    });

    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({ id: "writer-001" });
  });

  test("rejects non-json output paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmh-template-writer-"));

    await expect(
      new FilesystemBenchmarkTemplateWriter().write({
        outputPath: join(dir, "template.txt"),
        benchmark: benchmarkFixture()
      })
    ).rejects.toThrow(/\.json/i);
  });
});

function benchmarkFixture(): Benchmark {
  return BenchmarkSchema.parse({
    id: "writer-001",
    name: "Writer benchmark",
    version: "1.0.0",
    category: "feature",
    repo: {
      url: "file:///tmp/bmh/app",
      test_commands: ["npm test"]
    },
    prompt: {
      text: "Do the work."
    },
    expected_output: {
      tests_must_pass: true
    },
    limits: {
      timeout_seconds: 900
    },
    evaluation: {
      scoring: {
        tests: 1
      }
    }
  });
}
