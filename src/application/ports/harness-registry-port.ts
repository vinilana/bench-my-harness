import type {
  HarnessCommand,
  HarnessProfile,
  HarnessType
} from "../../domain/harnesses/harness-profile.js";

export type { HarnessCommand, HarnessProfile, HarnessType };

export interface HarnessRegistryPort {
  save(profile: HarnessProfile): Promise<void>;
  findByName(name: string): Promise<HarnessProfile | undefined>;
}
