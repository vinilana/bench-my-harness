import { describe, expect, test } from "vitest";
import { RegisterHarnessUseCase } from "../../src/application/use-cases/register-harness.js";
import type {
  HarnessProfile,
  HarnessRegistryPort
} from "../../src/application/ports/harness-registry-port.js";

class InMemoryHarnessRegistry implements HarnessRegistryPort {
  public readonly profiles = new Map<string, HarnessProfile>();

  public async save(profile: HarnessProfile): Promise<void> {
    this.profiles.set(profile.name, profile);
  }

  public async findByName(name: string): Promise<HarnessProfile | undefined> {
    return this.profiles.get(name);
  }
}

describe("harness registry", () => {
  test("rejects unsupported v1 harness types", async () => {
    const registry = new InMemoryHarnessRegistry();
    const useCase = new RegisterHarnessUseCase(registry);

    await expect(
      useCase.execute({
        name: "cursor-local",
        type: "cursor",
        version: "0.1.0",
        command: { executable: "cursor-agent", args: [] },
        capabilities: {}
      })
    ).rejects.toMatchObject({
      code: "unsupported_harness_type"
    });

    expect(registry.profiles.size).toBe(0);
  });

  test("stores registered harness profile with command, env, model, permissions, and capabilities", async () => {
    const registry = new InMemoryHarnessRegistry();
    const useCase = new RegisterHarnessUseCase(registry);

    const profile = await useCase.execute({
      name: "codex-local",
      type: "codex",
      version: "0.2.1",
      command: {
        executable: "node",
        args: ["fake-codex.js"],
        promptDelivery: "stdin"
      },
      env: {
        CODEX_HOME: "/tmp/codex-home"
      },
      model: "gpt-5-codex",
      permissions: {
        filesystem: "workspace",
        network: "disabled"
      },
      capabilities: {
        session_lifecycle: "native",
        turn_lifecycle: "partial",
        stdin: true,
        webhook: false
      }
    });

    expect(await registry.findByName("codex-local")).toEqual(profile);
    expect(profile).toMatchObject({
      name: "codex-local",
      type: "codex",
      version: "0.2.1",
      command: {
        executable: "node",
        args: ["fake-codex.js"],
        promptDelivery: "stdin"
      },
      env: {
        CODEX_HOME: "/tmp/codex-home"
      },
      model: "gpt-5-codex",
      permissions: {
        filesystem: "workspace",
        network: "disabled"
      },
      capabilities: {
        session_lifecycle: "native",
        turn_lifecycle: "partial",
        stdin: true,
        webhook: false
      }
    });
  });
});
