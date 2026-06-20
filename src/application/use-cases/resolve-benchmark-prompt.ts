import type { PromptFileReaderPort } from "../ports/prompt-file-reader-port.js";

export interface BenchmarkPromptSource {
  text?: string;
  file?: string;
}

export interface BenchmarkWithPrompt {
  prompt: BenchmarkPromptSource;
}

export interface ResolveBenchmarkPromptInput {
  benchmark: BenchmarkWithPrompt;
  root?: string;
  benchmarkRoot?: string;
  benchmarkFileDirectory?: string;
  workspaceRoot?: string;
}

export interface ResolvedBenchmarkPrompt {
  text: string;
  source:
    | {
        type: "text";
      }
    | {
        type: "file";
        path: string;
        contentHash: string;
      };
}

export class ResolveBenchmarkPromptUseCase {
  public constructor(private readonly promptFileReader: PromptFileReaderPort) {}

  public async execute(input: ResolveBenchmarkPromptInput): Promise<ResolvedBenchmarkPrompt> {
    const { prompt } = input.benchmark;
    const hasText = typeof prompt.text === "string";
    const hasFile = typeof prompt.file === "string";

    if (hasText === hasFile) {
      throw new Error("Benchmark prompt must define exactly one of text or file");
    }

    if (hasText) {
      return {
        text: prompt.text as string,
        source: {
          type: "text"
        }
      };
    }

    const root = input.root ?? input.benchmarkRoot ?? input.benchmarkFileDirectory ?? input.workspaceRoot;

    if (root === undefined) {
      throw new Error("Benchmark prompt file resolution requires a root directory");
    }

    const promptFile = await this.promptFileReader.read({
      root,
      path: prompt.file as string
    });

    return {
      text: promptFile.content,
      source: {
        type: "file",
        path: promptFile.path,
        contentHash: promptFile.contentHash
      }
    };
  }
}
