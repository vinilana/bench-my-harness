import { createHmac, timingSafeEqual } from "node:crypto";

export interface HmacSignatureInput {
  readonly secret: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly body: string;
}

export interface TimestampFreshnessInput {
  readonly timestamp: string;
  readonly now: Date;
  readonly maxSkewMs: number;
}

export function createPayloadSignature(input: HmacSignatureInput): `sha256=${string}` {
  return `sha256=${createHmac("sha256", input.secret).update(signatureBase(input)).digest("hex")}`;
}

export function verifyPayloadSignature(input: HmacSignatureInput & { readonly signature: string }): boolean {
  const actual = parseSha256Signature(input.signature);

  if (!actual) {
    return false;
  }

  const expected = Buffer.from(createPayloadSignature(input).slice("sha256=".length), "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

export function timestampIsFresh(input: TimestampFreshnessInput): boolean {
  const timestampMs = Date.parse(input.timestamp);

  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  return Math.abs(input.now.getTime() - timestampMs) <= input.maxSkewMs;
}

function parseSha256Signature(signature: string): Buffer | undefined {
  if (!signature.startsWith("sha256=")) {
    return undefined;
  }

  const hex = signature.slice("sha256=".length);

  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    return undefined;
  }

  return Buffer.from(hex, "hex");
}

function signatureBase(input: HmacSignatureInput): string {
  return `${input.timestamp}.${input.nonce}.${input.body}`;
}
