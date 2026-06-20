import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { BenchmarkSchema } from "../../../domain/benchmark/benchmark-schema.js";

export class FilesystemBenchmarkTemplateWriter {
  public async write(input: {
    readonly outputPath: string;
    readonly benchmark: unknown;
    readonly force?: boolean;
  }): Promise<void> {
    if (!input.outputPath.endsWith(".json")) {
      throw new Error("benchmark template output path must end with .json");
    }

    const benchmark = BenchmarkSchema.parse(input.benchmark);

    await mkdir(dirname(input.outputPath), { recursive: true });

    try {
      await writeFile(input.outputPath, `${JSON.stringify(benchmark, null, 2)}\n`, {
        encoding: "utf8",
        flag: input.force ? "w" : "wx"
      });
    } catch (error) {
      if (isFileExistsError(error)) {
        throw new Error(`benchmark template output already exists: ${input.outputPath}`);
      }

      throw error;
    }
  }
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "EEXIST";
}
