import {
  isSupportedHarnessType,
  UnsupportedHarnessTypeError,
  type HarnessCapabilityValue,
  type HarnessCommand,
  type HarnessProfile
} from "../../domain/harnesses/harness-profile.js";
import type { HarnessRegistryPort } from "../ports/harness-registry-port.js";

export interface RegisterHarnessInput {
  readonly name: string;
  readonly type: string;
  readonly version: string;
  readonly command: HarnessCommand;
  readonly env?: Readonly<Record<string, string>>;
  readonly model?: string;
  readonly permissions?: Readonly<Record<string, unknown>>;
  readonly capabilities: Readonly<Record<string, HarnessCapabilityValue>>;
}

export class RegisterHarnessUseCase {
  public constructor(private readonly registry: HarnessRegistryPort) {}

  public async execute(input: RegisterHarnessInput): Promise<HarnessProfile> {
    if (!isSupportedHarnessType(input.type)) {
      throw new UnsupportedHarnessTypeError(input.type);
    }

    const profile: HarnessProfile = {
      name: input.name,
      type: input.type,
      version: input.version,
      command: {
        executable: input.command.executable,
        args: input.command.args === undefined ? undefined : [...input.command.args],
        promptDelivery: input.command.promptDelivery
      },
      env: input.env === undefined ? undefined : { ...input.env },
      model: input.model,
      permissions: input.permissions === undefined ? undefined : { ...input.permissions },
      capabilities: { ...input.capabilities }
    };

    await this.registry.save(profile);
    return profile;
  }
}
