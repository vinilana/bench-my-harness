import type { HarnessName } from "./harness-runner-port.js";
import type { MetricObservation } from "./usage-capture-port.js";

export interface HookEventMetricInput {
  readonly spoolPath: string;
  readonly provider: HarnessName;
  readonly runId: string;
  readonly trialId: string;
  readonly observedAt: string;
}

export interface HookEventCounterPort {
  count(input: { readonly spoolPath: string }): Promise<number>;
  metrics?(input: HookEventMetricInput): Promise<readonly MetricObservation[]>;
}
