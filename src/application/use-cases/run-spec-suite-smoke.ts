import type { SuiteResultStore } from "../ports/suite-result-store.js";
import type { LoadedSpecCatalog } from "../../domain/benchmark/spec-catalog.js";
import type { SuiteReport } from "../../domain/reports/suite-report.js";
import type { BenchmarkRunner } from "./run-benchmark.js";
import { RunSpecSuiteUseCase } from "./run-spec-suite.js";

export interface RunSpecSuiteSmokeInput {
  readonly loadedCatalog: LoadedSpecCatalog;
  readonly runner: BenchmarkRunner;
  readonly runId: string;
  readonly workspaceRoot?: string;
  readonly catalogRoot: string;
}

export class RunSpecSuiteSmokeUseCase {
  public constructor(private readonly resultStore?: SuiteResultStore) {}

  public async execute(input: RunSpecSuiteSmokeInput): Promise<SuiteReport> {
    return new RunSpecSuiteUseCase(this.resultStore).execute({
      loadedCatalog: input.loadedCatalog,
      runner: input.runner,
      runId: input.runId,
      trials: 1,
      workspaceRoot: input.workspaceRoot,
      catalogRoot: input.catalogRoot
    });
  }
}
