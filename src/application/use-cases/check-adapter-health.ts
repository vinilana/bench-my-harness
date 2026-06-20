import type {
  AdapterHealthCheckPort,
  AdapterHealthResult
} from "../ports/adapter-health-check-port.js";
import type { HarnessProfile } from "../ports/harness-registry-port.js";

export class CheckAdapterHealthUseCase {
  public constructor(private readonly healthCheck: AdapterHealthCheckPort) {}

  public async execute(profile: HarnessProfile): Promise<AdapterHealthResult> {
    try {
      return await this.healthCheck.check(profile);
    } catch (error) {
      return {
        status: "unhealthy",
        harness: profile.type,
        checkedAt: new Date().toISOString(),
        reason: error instanceof Error ? error.message : "health check failed"
      };
    }
  }
}
