export interface ProvisionWorkspaceInput {
  workspaceRoot: string;
  trialId: string;
  source?: WorkspaceSource;
}

export interface ProvisionedWorkspace {
  workspace: string;
  spoolPath: string;
  workspaceSource?: WorkspaceSourceProvenance;
}

export interface WorkspaceProvisionerPort {
  provision(input: ProvisionWorkspaceInput): Promise<ProvisionedWorkspace>;
}

export type WorkspaceSource = GitWorkspaceSource;

export interface GitWorkspaceSource {
  type: "git";
  repoUrl: string;
  baseRef: string;
  goldenRef?: string;
}

export type WorkspaceSourceProvenance = GitWorkspaceSourceProvenance;

export interface GitWorkspaceSourceProvenance {
  type: "git";
  repo_url: string;
  base_ref: string;
  resolved_base_sha?: string;
  golden_ref?: string;
  resolved_golden_sha?: string;
}
