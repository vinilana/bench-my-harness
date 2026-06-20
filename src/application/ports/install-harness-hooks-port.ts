export type HarnessProvider = "codex" | "claude_code";

export interface InstallHarnessHooksInput {
  workspace: string;
  runId: string;
  trialId: string;
  spoolPath: string;
  harness?: HarnessProvider;
  strictTelemetry?: boolean;
  benchmarkId?: string;
  benchmarkVersion?: string;
}

export interface GeneratedHookFile {
  path: string;
  previousContent?: string;
}

export interface HookInstallation {
  id: string;
  provider?: HarnessProvider;
  workspace?: string;
  files: string[];
  generatedFiles?: GeneratedHookFile[];
}

export interface InstallHarnessHooksPort {
  install(input: InstallHarnessHooksInput): Promise<HookInstallation>;
  uninstall(installation: HookInstallation): Promise<void>;
}
