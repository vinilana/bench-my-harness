import { formatZodError, validateCatalogBenchmark } from "../../domain/benchmark/spec-catalog.js";
import type { LoadedSpecCatalog } from "../../domain/benchmark/spec-catalog.js";
import type { SpecCatalogStore } from "../ports/spec-catalog-store.js";

export interface ValidateSpecCatalogResult {
  readonly valid: boolean;
  readonly catalog?: LoadedSpecCatalog;
  readonly errors: readonly string[];
}

export class ValidateSpecCatalogUseCase {
  public constructor(private readonly store: SpecCatalogStore) {}

  public async execute(input: {
    readonly catalogRoot: string;
  }): Promise<ValidateSpecCatalogResult> {
    try {
      const catalog = await this.store.loadCatalog(input);
      const errors = catalog.specs.flatMap((spec) => {
        try {
          validateCatalogBenchmark(spec.benchmark);
          return [];
        } catch (error) {
          return [formatZodError(error)];
        }
      });

      return {
        valid: errors.length === 0,
        catalog,
        errors
      };
    } catch (error) {
      return {
        valid: false,
        errors: [formatZodError(error)]
      };
    }
  }
}
