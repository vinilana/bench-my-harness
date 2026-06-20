import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ProvisionedWorkspace,
  ProvisionWorkspaceInput,
  WorkspaceProvisionerPort
} from "../../../application/ports/workspace-provisioner-port.js";

export class FilesystemWorkspaceProvisioner implements WorkspaceProvisionerPort {
  public async provision(input: ProvisionWorkspaceInput): Promise<ProvisionedWorkspace> {
    const workspace = join(input.workspaceRoot, input.trialId);
    const spoolPath = join(workspace, ".bmh", "hooks.jsonl");

    await mkdir(dirname(spoolPath), { recursive: true });

    return { workspace, spoolPath };
  }
}
