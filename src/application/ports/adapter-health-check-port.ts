import type { HarnessProfile, HarnessType } from "./harness-registry-port.js";

export type AdapterHealthStatus = "healthy" | "unhealthy";

export interface AdapterHealthResult {
  readonly status: AdapterHealthStatus;
  readonly harness: HarnessType;
  readonly checkedAt: string;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AdapterHealthCheckPort {
  check(profile: HarnessProfile): Promise<AdapterHealthResult>;
}
