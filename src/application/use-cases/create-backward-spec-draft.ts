import type { GitHistoryInspectorPort } from "../ports/git-history-inspector-port.js";
import type { SpecCatalogStore } from "../ports/spec-catalog-store.js";
import {
  createBackwardSpecDraft,
  createSpecCatalog,
  inferSpecIdFromPromptPath,
  validateBackfillLimit,
  type FeatureSpecDraft
} from "../../domain/benchmark/spec-catalog.js";

export interface CreateBackwardSpecDraftInput {
  readonly catalogRoot: string;
  readonly repoPath: string;
  readonly repoUrl: string;
  readonly id?: string;
  readonly name?: string;
  readonly category: string;
  readonly baseRef: string;
  readonly goldenRef: string;
  readonly setupCommands?: readonly string[];
  readonly testCommands?: readonly string[];
  readonly includeInSuite?: boolean;
  readonly force?: boolean;
}

export interface BackfillSpecDraftsInput {
  readonly catalogRoot: string;
  readonly repoPath: string;
  readonly repoUrl: string;
  readonly range: string;
  readonly outputPrefix?: string;
  readonly limit?: number;
  readonly category?: string;
  readonly includeInSuite?: boolean;
  readonly force?: boolean;
}

export class CreateBackwardSpecDraftUseCase {
  public constructor(
    private readonly ports: {
      readonly store: SpecCatalogStore;
      readonly gitHistory: GitHistoryInspectorPort;
    }
  ) {}

  public async execute(input: CreateBackwardSpecDraftInput): Promise<FeatureSpecDraft> {
    const evidence = await this.ports.gitHistory.inspectRange({
      repoPath: input.repoPath,
      baseRef: input.baseRef,
      goldenRef: input.goldenRef
    });
    const subject = evidence.commitMessages[0] ?? evidence.goldenRef;
    const draft = createBackwardSpecDraft({
      id: input.id ?? inferSpecIdFromPromptPath(`${subject}.md`),
      name: input.name ?? subject,
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

  public async backfill(input: BackfillSpecDraftsInput): Promise<readonly FeatureSpecDraft[]> {
    const limit = validateBackfillLimit(input.limit);
    await this.ensureCatalog(input.catalogRoot);
    const evidenceItems = await this.ports.gitHistory.listCandidateRanges({
      repoPath: input.repoPath,
      range: input.range,
      limit
    });
    const drafts: FeatureSpecDraft[] = [];

    for (const evidence of evidenceItems.slice(0, limit)) {
      const id = this.backfillIdFor(input.outputPrefix, evidence.goldenRef);
      const draft = relocateDraft(createBackwardSpecDraft({
        id,
        name: id,
        category: input.category ?? "feature",
        repoUrl: input.repoUrl,
        evidence
      }), input.outputPrefix ?? "backfill");

      drafts.push(await this.ports.store.writeFeatureSpec({
        catalogRoot: input.catalogRoot,
        draft,
        includeInSuite: input.includeInSuite ?? false,
        force: input.force
      }));
    }

    return drafts;
  }

  private backfillIdFor(outputPrefix: string | undefined, goldenRef: string): string {
    const normalizedRef = goldenRef.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 32);
    return `backfill-${normalizedRef}`;
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

function relocateDraft(draft: FeatureSpecDraft, parentDirectory: string): FeatureSpecDraft {
  const directory = `${parentDirectory}/${draft.benchmark.id}`;
  return {
    ...draft,
    directory,
    specPath: `${directory}/spec.md`,
    benchmarkPath: `${directory}/benchmark.json`,
    suiteReference: {
      ...draft.suiteReference,
      path: `${directory}/benchmark.json`
    }
  };
}
