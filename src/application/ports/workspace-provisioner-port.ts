export interface ProvisionWorkspaceInput {
  workspaceRoot: string;
  trialId: string;
}

export interface ProvisionedWorkspace {
  workspace: string;
  spoolPath: string;
}

export interface WorkspaceProvisionerPort {
  provision(input: ProvisionWorkspaceInput): Promise<ProvisionedWorkspace>;
}
