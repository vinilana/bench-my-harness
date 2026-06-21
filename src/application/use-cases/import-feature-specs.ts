import type { SpecCatalogStore } from "../ports/spec-catalog-store.js";
import type { PromptFileReaderPort } from "../ports/prompt-file-reader-port.js";
import {
  CreateFeatureSpecFromPromptFileUseCase,
  type CreateFeatureSpecFromPromptFilePorts
} from "./create-feature-spec-from-prompt-file.js";
import {
  inferSpecIdFromPromptPath,
  type FeatureSpecDraft,
  type SpecAuthoringDefaultsInput
} from "../../domain/benchmark/spec-catalog.js";

export interface ImportFeatureSpecInput {
  readonly promptPath: string;
  readonly promptMarkdown?: string;
  readonly overrides?: SpecAuthoringDefaultsInput;
}

export interface ImportFeatureSpecsInput {
  readonly catalogRoot: string;
  readonly promptRoot?: string;
  readonly repoUrl?: string;
  readonly prompts: readonly ImportFeatureSpecInput[];
  readonly baseRef?: string;
  readonly goldenRef?: string;
  readonly force?: boolean;
}

export class ImportFeatureSpecsUseCase {
  private readonly createFromPrompt: CreateFeatureSpecFromPromptFileUseCase;

  public constructor(ports: CreateFeatureSpecFromPromptFilePorts);
  public constructor(store: SpecCatalogStore, promptReader?: PromptFileReaderPort);
  public constructor(
    portsOrStore: CreateFeatureSpecFromPromptFilePorts | SpecCatalogStore,
    promptReader?: PromptFileReaderPort
  ) {
    const ports = isCreateFromPromptPorts(portsOrStore)
      ? portsOrStore
      : {
          store: portsOrStore,
          promptReader
        };
    this.createFromPrompt = new CreateFeatureSpecFromPromptFileUseCase(ports);
  }

  public async execute(input: ImportFeatureSpecsInput): Promise<readonly FeatureSpecDraft[]> {
    if (!input.force) {
      this.rejectDuplicatePromptIds(input.prompts);
    }

    const drafts: FeatureSpecDraft[] = [];

    for (const prompt of input.prompts) {
      const draft = await this.createFromPrompt.execute({
        catalogRoot: input.catalogRoot,
        promptRoot: input.promptRoot,
        repoUrl: input.repoUrl,
        promptPath: prompt.promptPath,
        promptMarkdown: prompt.promptMarkdown,
        baseRef: input.baseRef,
        goldenRef: input.goldenRef,
        overrides: prompt.overrides,
        force: input.force
      });

      drafts.push(draft);
    }

    return drafts;
  }

  private rejectDuplicatePromptIds(prompts: readonly ImportFeatureSpecInput[]): void {
    const seen = new Set<string>();

    for (const prompt of prompts) {
      const id = prompt.overrides?.id ?? inferSpecIdFromPromptPath(prompt.promptPath);
      if (seen.has(id)) {
        throw new Error(`duplicate imported spec id: ${id}`);
      }

      seen.add(id);
    }
  }
}

function isCreateFromPromptPorts(value: CreateFeatureSpecFromPromptFilePorts | SpecCatalogStore): value is CreateFeatureSpecFromPromptFilePorts {
  return "store" in value;
}
