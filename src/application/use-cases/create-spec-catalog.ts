import type { SpecCatalogStore } from "../ports/spec-catalog-store.js";
import { createSpecCatalog, type CreateSpecCatalogInput } from "../../domain/benchmark/spec-catalog.js";
import type { SpecCatalog } from "../../domain/benchmark/benchmark-schema.js";

export interface CreateSpecCatalogUseCaseInput extends CreateSpecCatalogInput {
  readonly catalogRoot: string;
  readonly force?: boolean;
}

export class CreateSpecCatalogUseCase {
  public constructor(private readonly store: SpecCatalogStore) {}

  public async execute(input: CreateSpecCatalogUseCaseInput): Promise<SpecCatalog> {
    const catalog = createSpecCatalog(input);
    return this.store.createCatalog({
      catalogRoot: input.catalogRoot,
      catalog,
      force: input.force
    });
  }
}
