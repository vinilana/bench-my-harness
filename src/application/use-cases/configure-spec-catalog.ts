import type { SpecCatalog } from "../../domain/benchmark/benchmark-schema.js";
import type { SpecCatalogDefaults } from "../../domain/benchmark/spec-catalog.js";
import type { SpecCatalogStore } from "../ports/spec-catalog-store.js";

export interface ConfigureSpecCatalogInput {
  readonly catalogRoot: string;
  readonly defaults: SpecCatalogDefaults;
}

export class ConfigureSpecCatalogUseCase {
  public constructor(private readonly store: SpecCatalogStore) {}

  public async execute(input: ConfigureSpecCatalogInput): Promise<SpecCatalog> {
    if (this.store.updateDefaults === undefined) {
      throw new Error("Spec catalog store does not support defaults updates");
    }

    return this.store.updateDefaults({
      catalogRoot: input.catalogRoot,
      defaults: input.defaults
    });
  }
}
