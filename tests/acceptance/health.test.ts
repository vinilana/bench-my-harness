import { describe, expect, test } from "vitest";
import { CheckAdapterHealthUseCase } from "../../src/application/use-cases/check-adapter-health.js";
import type {
  AdapterHealthCheckPort,
  AdapterHealthResult
} from "../../src/application/ports/adapter-health-check-port.js";
import type { HarnessProfile } from "../../src/application/ports/harness-registry-port.js";

const codexProfile: HarnessProfile = {
  name: "codex-local",
  type: "codex",
  version: "0.1.0",
  command: { executable: "node", args: ["fake-codex.js"] },
  capabilities: {
    stdin: true,
    session_lifecycle: "native"
  }
};

class FakeHealthChecker implements AdapterHealthCheckPort {
  public constructor(private readonly result: AdapterHealthResult | Error) {}

  public async check(): Promise<AdapterHealthResult> {
    if (this.result instanceof Error) {
      throw this.result;
    }

    return this.result;
  }
}

describe("adapter health check", () => {
  test("reports healthy adapter status", async () => {
    const useCase = new CheckAdapterHealthUseCase(
      new FakeHealthChecker({
        status: "healthy",
        harness: "codex",
        checkedAt: "2026-06-20T12:00:00.000Z",
        details: {
          command: "node fake-codex.js"
        }
      })
    );

    await expect(useCase.execute(codexProfile)).resolves.toMatchObject({
      status: "healthy",
      harness: "codex",
      details: {
        command: "node fake-codex.js"
      }
    });
  });

  test("reports unhealthy adapter status instead of throwing", async () => {
    const useCase = new CheckAdapterHealthUseCase(
      new FakeHealthChecker(new Error("command not found"))
    );

    await expect(useCase.execute(codexProfile)).resolves.toMatchObject({
      status: "unhealthy",
      harness: "codex",
      reason: "command not found"
    });
  });
});
