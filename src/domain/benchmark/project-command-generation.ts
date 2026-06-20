export type SupportedProjectEcosystem = "node";

export type NodePackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type ProjectCommandConfidence = "high" | "medium" | "low";

export interface SupportedProjectCommandDetection {
  readonly supported: true;
  readonly ecosystem: SupportedProjectEcosystem;
  readonly packageManager: NodePackageManager;
  readonly scripts: readonly string[];
  readonly evidence: readonly string[];
}

export interface UnsupportedProjectCommandDetection {
  readonly supported: false;
  readonly reason: string;
  readonly evidence?: readonly string[];
}

export type ProjectCommandDetection = SupportedProjectCommandDetection | UnsupportedProjectCommandDetection;

export interface GeneratedProjectCommands {
  readonly ecosystem: SupportedProjectEcosystem;
  readonly packageManager: NodePackageManager;
  readonly confidence: ProjectCommandConfidence;
  readonly setupCommands: readonly string[];
  readonly validationCommands: readonly string[];
  readonly evidence: readonly string[];
}
