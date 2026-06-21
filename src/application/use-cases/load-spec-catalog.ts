import type { SpecCatalogStore } from "../ports/spec-catalog-store.js";
import type { LoadedSpecCatalog } from "../../domain/benchmark/spec-catalog.js";

export class LoadSpecCatalogUseCase {
  public constructor(private readonly store: SpecCatalogStore) {}

  public execute(input: {
    readonly catalogRoot: string;
  }): Promise<LoadedSpecCatalog> {
    return this.store.loadCatalog(input);
  }
}
