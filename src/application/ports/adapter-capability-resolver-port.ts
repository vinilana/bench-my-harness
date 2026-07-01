import type { HarnessName } from "./harness-runner-port.js";

export type AdapterCapabilityValue = string | boolean;

export interface AdapterCapabilityMatrix {
  readonly provider: HarnessName;
  readonly adapter_version: string;
  readonly supported_provider_versions: readonly string[];
  readonly capabilities: Readonly<Record<string, AdapterCapabilityValue>>;
  readonly capability_evidence: Readonly<Record<string, readonly string[]>>;
  readonly known_gaps?: readonly string[];
}

export interface AdapterCapabilityResolverPort {
  resolve(harness: HarnessName): AdapterCapabilityMatrix | undefined;
}
