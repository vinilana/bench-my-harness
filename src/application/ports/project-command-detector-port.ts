export type ProjectEcosystem = "node";

export type NodePackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface DetectProjectCommandsInput {
  readonly root: string;
}

export type ProjectCommandDetection = SupportedProjectCommandDetection | UnsupportedProjectCommandDetection;

export interface SupportedProjectCommandDetection {
  readonly supported: true;
  readonly ecosystem: ProjectEcosystem;
  readonly packageManager: NodePackageManager;
  readonly scripts: readonly string[];
  readonly evidence: readonly string[];
}

export interface UnsupportedProjectCommandDetection {
  readonly supported: false;
  readonly reason: string;
  readonly evidence?: readonly string[];
}

export interface ProjectCommandDetectorPort {
  detect(input: DetectProjectCommandsInput): Promise<ProjectCommandDetection>;
}
