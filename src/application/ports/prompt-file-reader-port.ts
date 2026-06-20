export interface ReadPromptFileInput {
  root: string;
  path: string;
}

export interface ReadPromptFileResult {
  path: string;
  content: string;
  contentHash: string;
}

export interface PromptFileReaderPort {
  read(input: ReadPromptFileInput): Promise<ReadPromptFileResult>;
}
