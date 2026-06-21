import type { PromptFileReaderPort } from "../ports/prompt-file-reader-port.js";
import type { SpecCatalogStore } from "../ports/spec-catalog-store.js";
import {
  createFeatureSpecDraft,
  mergeSpecAuthoringDefaults,
  type FeatureSpecDraft,
  type SpecAuthoringDefaultsInput
} from "../../domain/benchmark/spec-catalog.js";

export interface CreateFeatureSpecFromPromptFileInput {
  readonly catalogRoot: string;
  readonly promptRoot?: string;
  readonly promptPath: string;
  readonly promptMarkdown?: string;
  readonly repoUrl?: string;
  readonly baseRef?: string;
  readonly goldenRef?: string;
  readonly tags?: readonly string[];
  readonly difficulty?: string;
  readonly force?: boolean;
  readonly overrides?: SpecAuthoringDefaultsInput;
}

export interface CreateFeatureSpecFromPromptFilePorts {
  readonly store: SpecCatalogStore;
  readonly promptReader?: PromptFileReaderPort;
  readonly resolveRepoUrl?: (repoPath: string) => string;
}

export class CreateFeatureSpecFromPromptFileUseCase {
  private readonly ports: CreateFeatureSpecFromPromptFilePorts;

  public constructor(ports: CreateFeatureSpecFromPromptFilePorts);
  public constructor(store: SpecCatalogStore);
  public constructor(portsOrStore: CreateFeatureSpecFromPromptFilePorts | SpecCatalogStore) {
    this.ports = isCreateFromPromptPorts(portsOrStore) ? portsOrStore : { store: portsOrStore };
  }

  public async execute(input: CreateFeatureSpecFromPromptFileInput): Promise<FeatureSpecDraft> {
    const [loaded, prompt] = await Promise.all([
      this.ports.store.loadCatalog({ catalogRoot: input.catalogRoot }).catch(() => undefined),
      this.readPrompt(input)
    ]);
    const resolved = mergeSpecAuthoringDefaults({
      promptPath: input.promptPath,
      promptMarkdown: prompt.content,
      catalogDefaults: loaded?.catalog.defaults,
      overrides: input.overrides
    });
    const repoUrl = input.repoUrl ?? this.ports.resolveRepoUrl?.(resolved.repoPath) ?? resolved.repoPath;
    const draft = createFeatureSpecDraft({
      id: resolved.id,
      name: resolved.name,
      category: resolved.category,
      difficulty: input.difficulty,
      tags: input.tags,
      repoUrl,
      baseRef: input.baseRef,
      goldenRef: input.goldenRef,
      setupCommands: resolved.setupCommands,
      testCommands: resolved.testCommands,
      promptMarkdown: prompt.content,
      metadata: {
        source: "manual_cli",
        source_prompt_file: prompt.path
      }
    });

    return this.ports.store.writeFeatureSpec({
      catalogRoot: input.catalogRoot,
      draft,
      includeInSuite: resolved.includeInSuite,
      force: input.force
    });
  }

  private async readPrompt(input: CreateFeatureSpecFromPromptFileInput): Promise<{
    readonly path: string;
    readonly content: string;
  }> {
    if (input.promptMarkdown !== undefined) {
      return {
        path: input.promptPath,
        content: input.promptMarkdown
      };
    }

    if (this.ports.promptReader === undefined || input.promptRoot === undefined) {
      throw new Error("Prompt file reader and prompt root are required when promptMarkdown is not provided");
    }

    return this.ports.promptReader.read({
      root: input.promptRoot,
      path: input.promptPath
    });
  }
}

function isCreateFromPromptPorts(
  value: CreateFeatureSpecFromPromptFilePorts | SpecCatalogStore
): value is CreateFeatureSpecFromPromptFilePorts {
  return "store" in value;
}
