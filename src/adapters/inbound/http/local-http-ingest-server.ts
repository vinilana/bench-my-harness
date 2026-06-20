import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { JsonValue, HarnessProvider } from "../../../application/ports/raw-event-store.js";
import type { RawEventIngestPort } from "../../../application/ports/raw-event-ingest-port.js";
import { timestampIsFresh, verifyPayloadSignature } from "../../../domain/security/hmac-signature.js";

export interface LocalHttpIngestServerOptions {
  readonly ingestPort: RawEventIngestPort;
  readonly hmacSecret: string;
  readonly runId: string;
  readonly trialId: string;
  readonly maxPayloadBytes?: number;
  readonly maxTimestampSkewMs?: number;
  readonly now?: () => Date;
}

interface ErrorResponse {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

const DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024;
const DEFAULT_MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const SUPPORTED_PROVIDERS = new Set<string>(["codex", "claude_code"]);

export function createLocalHttpIngestServer(options: LocalHttpIngestServerOptions): Server {
  const nonces = new ExpiringNonceSet(options.maxTimestampSkewMs ?? DEFAULT_MAX_TIMESTAMP_SKEW_MS);

  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, options, nonces);
    } catch {
      writeError(response, {
        statusCode: 500,
        code: "internal_error",
        message: "internal server error"
      });
    }
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: LocalHttpIngestServerOptions,
  nonces: ExpiringNonceSet
): Promise<void> {
  if (request.method !== "POST") {
    writeError(response, {
      statusCode: 405,
      code: "method_not_allowed",
      message: "method not allowed"
    });
    return;
  }

  const provider = providerFromUrl(request.url);

  if (!provider) {
    writeError(response, {
      statusCode: 404,
      code: "not_found",
      message: "unsupported endpoint or provider"
    });
    return;
  }

  const bodyResult = await readBody(request, options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES);

  if (!bodyResult.ok) {
    writeError(response, {
      statusCode: 413,
      code: "payload_too_large",
      message: "payload too large"
    });
    return;
  }

  const auth = validateSignature(request, bodyResult.body, options);

  if (auth) {
    writeError(response, auth);
    return;
  }

  const timestamp = readRequiredHeader(request, "x-bmh-timestamp");
  const nonce = readRequiredHeader(request, "x-bmh-nonce");
  const replayKey = `${provider}:${nonce}`;

  if (nonces.has(replayKey)) {
    writeError(response, {
      statusCode: 409,
      code: "replay_detected",
      message: "replay detected"
    });
    return;
  }

  const payload = parseJsonObject(bodyResult.body);

  if (!payload) {
    writeError(response, {
      statusCode: 400,
      code: "invalid_json",
      message: "expected a JSON object"
    });
    return;
  }

  nonces.add(replayKey, Date.parse(timestamp));

  await options.ingestPort.ingest({
    provider,
    run_id: options.runId,
    trial_id: options.trialId,
    payload,
    observed_at: (options.now ?? (() => new Date()))().toISOString()
  });

  response.writeHead(202, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: "accepted" }));
}

function validateSignature(
  request: IncomingMessage,
  body: string,
  options: LocalHttpIngestServerOptions
): ErrorResponse | undefined {
  const timestamp = readRequiredHeader(request, "x-bmh-timestamp");
  const nonce = readRequiredHeader(request, "x-bmh-nonce");
  const signature = readRequiredHeader(request, "x-bmh-signature");

  if (!timestamp || !nonce || !signature) {
    return {
      statusCode: 401,
      code: "invalid_signature",
      message: "missing or invalid signature"
    };
  }

  if (!timestampIsFresh({
    timestamp,
    now: (options.now ?? (() => new Date()))(),
    maxSkewMs: options.maxTimestampSkewMs ?? DEFAULT_MAX_TIMESTAMP_SKEW_MS
  })) {
    return {
      statusCode: 401,
      code: "stale_timestamp",
      message: "stale timestamp"
    };
  }

  if (!verifyPayloadSignature({ secret: options.hmacSecret, timestamp, nonce, body, signature })) {
    return {
      statusCode: 401,
      code: "invalid_signature",
      message: "missing or invalid signature"
    };
  }

  return undefined;
}

function providerFromUrl(url: string | undefined): HarnessProvider | undefined {
  if (!url) {
    return undefined;
  }

  const parsed = new URL(url, "http://127.0.0.1");
  const match = parsed.pathname.match(/^\/v1\/events\/([^/]+)$/);

  if (!match || !SUPPORTED_PROVIDERS.has(match[1])) {
    return undefined;
  }

  return match[1] as HarnessProvider;
}

async function readBody(
  request: IncomingMessage,
  maxPayloadBytes: number
): Promise<{ ok: true; body: string } | { ok: false }> {
  const chunks: Buffer[] = [];
  let payloadBytes = 0;
  let tooLarge = false;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    payloadBytes += buffer.byteLength;

    if (payloadBytes > maxPayloadBytes) {
      tooLarge = true;
      continue;
    }

    chunks.push(buffer);
  }

  if (tooLarge) {
    return { ok: false };
  }

  return { ok: true, body: Buffer.concat(chunks).toString("utf8") };
}

function parseJsonObject(body: string): JsonValue | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    return parsed as JsonValue;
  } catch {
    return undefined;
  }
}

function readRequiredHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function writeError(response: ServerResponse, error: ErrorResponse): void {
  response.writeHead(error.statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: error.code, message: error.message }));
}

class ExpiringNonceSet {
  private readonly seen = new Map<string, number>();

  constructor(private readonly ttlMs: number) {}

  has(key: string): boolean {
    this.prune(Date.now());
    return this.seen.has(key);
  }

  add(key: string, timestampMs: number): void {
    this.prune(Date.now());
    this.seen.set(key, timestampMs);
  }

  private prune(nowMs: number): void {
    for (const [key, timestampMs] of this.seen) {
      if (Math.abs(nowMs - timestampMs) > this.ttlMs) {
        this.seen.delete(key);
      }
    }
  }
}
