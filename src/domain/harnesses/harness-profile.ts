export const SUPPORTED_HARNESS_TYPES = ["codex", "claude_code"] as const;

export type HarnessType = (typeof SUPPORTED_HARNESS_TYPES)[number];
export type HarnessCapabilityConfidence =
  | "native"
  | "derived"
  | "estimated"
  | "partial"
  | "unavailable"
  | "unknown";
export type HarnessCapabilityValue = HarnessCapabilityConfidence | boolean;

export interface HarnessCommand {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly promptDelivery?: "stdin";
}

export interface HarnessProfile {
  readonly name: string;
  readonly type: HarnessType;
  readonly version: string;
  readonly command: HarnessCommand;
  readonly env?: Readonly<Record<string, string>>;
  readonly model?: string;
  readonly permissions?: Readonly<Record<string, unknown>>;
  readonly capabilities: Readonly<Record<string, HarnessCapabilityValue>>;
}

export class UnsupportedHarnessTypeError extends Error {
  public readonly code = "unsupported_harness_type";

  public constructor(public readonly harnessType: string) {
    super(`Unsupported v1 harness type: ${harnessType}`);
  }
}

export function isSupportedHarnessType(value: string): value is HarnessType {
  return SUPPORTED_HARNESS_TYPES.includes(value as HarnessType);
}
