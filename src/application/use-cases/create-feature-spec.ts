import type { SpecCatalogStore } from "../ports/spec-catalog-store.js";
import {
  createFeatureSpecDraft,
  type FeatureSpecAuthoringInput,
  type FeatureSpecDraft
} from "../../domain/benchmark/spec-catalog.js";

export interface CreateFeatureSpecUseCaseInput extends FeatureSpecAuthoringInput {
  readonly catalogRoot: string;
  readonly includeInSuite?: boolean;
  readonly force?: boolean;
}

export class CreateFeatureSpecUseCase {
  public constructor(private readonly store: SpecCatalogStore) {}

  public async execute(input: CreateFeatureSpecUseCaseInput): Promise<FeatureSpecDraft> {
    const draft = createFeatureSpecDraft(input);
    return this.store.writeFeatureSpec({
      catalogRoot: input.catalogRoot,
      draft,
      includeInSuite: input.includeInSuite,
      force: input.force
    });
  }
}
