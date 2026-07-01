import type { SuiteResultStore } from "../ports/suite-result-store.js";
import type { AdapterCapabilityResolverPort } from "../ports/adapter-capability-resolver-port.js";
import type { BenchmarkTrialRunnerPort } from "../ports/benchmark-trial-runner-port.js";
import type { LoadedSpecCatalog } from "../../domain/benchmark/spec-catalog.js";
import type { SuiteReport } from "../../domain/reports/suite-report.js";
import { RunSpecSuiteUseCase } from "./run-spec-suite.js";

export interface RunSpecSuiteSmokeInput {
  readonly loadedCatalog: LoadedSpecCatalog;
  readonly runner: BenchmarkTrialRunnerPort;
  readonly runId: string;
  readonly workspaceRoot?: string;
  readonly catalogRoot: string;
}

export class RunSpecSuiteSmokeUseCase {
  public constructor(
    private readonly resultStore?: SuiteResultStore,
    private readonly capabilityResolver?: AdapterCapabilityResolverPort
  ) {}

  public async execute(input: RunSpecSuiteSmokeInput): Promise<SuiteReport> {
    return new RunSpecSuiteUseCase(this.resultStore, this.capabilityResolver).execute({
      loadedCatalog: input.loadedCatalog,
      runner: input.runner,
      runId: input.runId,
      trials: 1,
      workspaceRoot: input.workspaceRoot,
      catalogRoot: input.catalogRoot
    });
  }
}
