import type { GitHistoryInspectorPort } from "../ports/git-history-inspector-port.js";
import type { SpecCatalogStore } from "../ports/spec-catalog-store.js";
import {
  createGeneratedGitCase,
  createSpecCatalog,
  generateDefaultSpecIdentity,
  inferSpecIdFromPromptPath,
  validateGeneratedGitLimit,
  type FeatureSpecDraft
} from "../../domain/benchmark/spec-catalog.js";
import type { BenchmarkCategory } from "../../domain/benchmark/benchmark-schema.js";

export interface CreateGeneratedGitCaseInput {
  readonly catalogRoot: string;
  readonly repoPath: string;
  readonly repoUrl: string;
  readonly id?: string;
  readonly name?: string;
  readonly category: BenchmarkCategory;
  readonly baseRef: string;
  readonly goldenRef: string;
  readonly setupCommands?: readonly string[];
  readonly testCommands?: readonly string[];
  readonly includeInSuite?: boolean;
  readonly force?: boolean;
}

export interface CreateGeneratedGitCasesInput {
  readonly catalogRoot: string;
  readonly repoPath: string;
  readonly repoUrl: string;
  readonly range: string;
  readonly limit?: number;
  readonly category?: BenchmarkCategory;
  readonly includeInSuite?: boolean;
  readonly force?: boolean;
}

export class CreateGeneratedGitCaseUseCase {
  public constructor(
    private readonly ports: {
      readonly store: SpecCatalogStore;
      readonly gitHistory: GitHistoryInspectorPort;
    }
  ) {}

  public async execute(input: CreateGeneratedGitCaseInput): Promise<FeatureSpecDraft> {
    const evidence = await this.ports.gitHistory.inspectRange({
      repoPath: input.repoPath,
      baseRef: input.baseRef,
      goldenRef: input.goldenRef
    });
    const identity = generateDefaultSpecIdentity();
    const draft = createGeneratedGitCase({
      id: input.id ?? inferSpecIdFromPromptPath(`${input.name ?? identity.name}.md`),
      name: input.name ?? identity.name,
      category: input.category,
      repoUrl: input.repoUrl,
      evidence,
      setupCommands: input.setupCommands,
      testCommands: input.testCommands
    });

    return this.ports.store.writeFeatureSpec({
      catalogRoot: input.catalogRoot,
      draft,
      includeInSuite: input.includeInSuite,
      force: input.force
    });
  }

  public async createGeneratedGitCases(input: CreateGeneratedGitCasesInput): Promise<readonly FeatureSpecDraft[]> {
    const limit = validateGeneratedGitLimit(input.limit);
    await this.ensureCatalog(input.catalogRoot);
    const evidenceItems = await this.ports.gitHistory.listCandidateRanges({
      repoPath: input.repoPath,
      range: input.range,
      limit
    });
    const drafts: FeatureSpecDraft[] = [];

    for (const [index, evidence] of evidenceItems.slice(0, limit).entries()) {
      const id = this.generatedGitIdFor(evidence.goldenRef);
      const identity = generateDefaultSpecIdentity(index);
      const draft = createGeneratedGitCase({
        id,
        name: identity.name,
        category: input.category ?? "feature",
        repoUrl: input.repoUrl,
        evidence
      });

      drafts.push(await this.ports.store.writeFeatureSpec({
        catalogRoot: input.catalogRoot,
        draft,
        includeInSuite: input.includeInSuite ?? false,
        force: input.force
      }));
    }

    return drafts;
  }

  private generatedGitIdFor(goldenRef: string): string {
    const normalizedRef = goldenRef.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 32);
    return `generated-git-${normalizedRef}`;
  }

  private async ensureCatalog(catalogRoot: string): Promise<void> {
    try {
      await this.ports.store.createCatalog({
        catalogRoot,
        catalog: createSpecCatalog(),
        force: false
      });
    } catch (error) {
      if (error instanceof Error && /exist|overwrite/i.test(error.message)) {
        return;
      }

      throw error;
    }
  }
}
