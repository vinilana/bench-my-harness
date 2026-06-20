import {
  createBenchmarkTemplate,
  type CreateBenchmarkTemplateInput
} from "../../domain/benchmark/create-benchmark-template.js";
import type { Benchmark } from "../../domain/benchmark/benchmark-schema.js";

export class CreateBenchmarkTemplateUseCase {
  public execute(input: CreateBenchmarkTemplateInput): Benchmark {
    return createBenchmarkTemplate(input);
  }
}
