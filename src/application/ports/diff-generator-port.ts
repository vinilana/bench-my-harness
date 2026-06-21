export interface DiffGeneratorInput {
  readonly workspace: string;
}

export interface DiffGeneratorResult {
  readonly diffPath?: string;
}

export interface DiffGeneratorPort {
  generate(input: DiffGeneratorInput): Promise<DiffGeneratorResult>;
}
