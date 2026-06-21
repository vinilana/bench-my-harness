import type { FeatureSpecDraft, LoadedSpecCatalog, SpecCatalogDefaults } from "../../domain/benchmark/spec-catalog.js";
import type { SpecCatalog } from "../../domain/benchmark/benchmark-schema.js";

export interface SpecCatalogStore {
  createCatalog(input: {
    catalogRoot: string;
    catalog: SpecCatalog;
    force?: boolean;
  }): Promise<SpecCatalog>;

  loadCatalog(input: {
    catalogRoot: string;
  }): Promise<LoadedSpecCatalog>;

  updateDefaults?(input: {
    catalogRoot: string;
    defaults: SpecCatalogDefaults;
  }): Promise<SpecCatalog>;

  writeFeatureSpec(input: {
    catalogRoot: string;
    draft: FeatureSpecDraft;
    includeInSuite?: boolean;
    force?: boolean;
  }): Promise<FeatureSpecDraft>;
}
