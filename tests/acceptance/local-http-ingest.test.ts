import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { createLocalHttpIngestServer } from "../../src/adapters/inbound/http/local-http-ingest-server.js";
import type { RawEventIngestPort } from "../../src/application/ports/raw-event-ingest-port.js";
import type { AppendRawHookEventInput } from "../../src/application/ports/raw-event-store.js";
import codexPreToolUse from "../fixtures/codex/pre-tool-use.json" with { type: "json" };
import claudePreToolUse from "../fixtures/claude-code/pre-tool-use.json" with { type: "json" };

describe("local HTTP ingest", () => {
  const secret = "test-hmac-secret";
  const runId = "run_1";
  const trialId = "trial_1";
  const servers: Array<{ close: (callback?: (error?: Error) => void) => void }> = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error?: Error) => (error ? reject(error) : resolve()));
          })
      )
    );
    servers.length = 0;
  });

  test("accepts signed Codex JSON and calls the ingest port", async () => {
    const ingest = new RecordingIngestPort();
    const server = await startServer(ingest);
    const body = JSON.stringify(codexPreToolUse);

    const response = await postSigned(server, "/v1/events/codex", body, { nonce: "nonce-1" });

    expect(response.status).toBe(202);
    expect(ingest.events).toHaveLength(1);
    expect(ingest.events[0]).toMatchObject({
      provider: "codex",
      run_id: runId,
      trial_id: trialId,
      payload: codexPreToolUse
    });
  });

  test("accepts signed Claude Code JSON and calls the ingest port", async () => {
    const ingest = new RecordingIngestPort();
    const server = await startServer(ingest);
    const body = JSON.stringify(claudePreToolUse);

    const response = await postSigned(server, "/v1/events/claude_code", body, { nonce: "nonce-2" });

    expect(response.status).toBe(202);
    expect(ingest.events[0]?.provider).toBe("claude_code");
    expect(ingest.events[0]?.payload).toEqual(claudePreToolUse);
  });

  test("rejects unsupported providers", async () => {
    const ingest = new RecordingIngestPort();
    const server = await startServer(ingest);
    const body = JSON.stringify(codexPreToolUse);

    const response = await postSigned(server, "/v1/events/opencode", body, { nonce: "nonce-3" });

    expect(response.status).toBe(404);
    expect(ingest.events).toHaveLength(0);
  });

  test("rejects missing or invalid HMAC signatures", async () => {
    const ingest = new RecordingIngestPort();
    const server = await startServer(ingest);
    const body = JSON.stringify(codexPreToolUse);

    const missing = await fetch(urlFor(server, "/v1/events/codex"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bmh-timestamp": new Date().toISOString(),
        "x-bmh-nonce": "nonce-4"
      },
      body
    });
    const invalid = await postSigned(server, "/v1/events/codex", body, {
      nonce: "nonce-5",
      signature: "sha256=bad"
    });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(ingest.events).toHaveLength(0);
  });

  test("rejects stale timestamps and replayed nonces", async () => {
    const ingest = new RecordingIngestPort();
    const server = await startServer(ingest);
    const body = JSON.stringify(codexPreToolUse);
    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const stale = await postSigned(server, "/v1/events/codex", body, {
      nonce: "nonce-6",
      timestamp: staleTimestamp
    });
    const first = await postSigned(server, "/v1/events/codex", body, { nonce: "nonce-7" });
    const replay = await postSigned(server, "/v1/events/codex", body, { nonce: "nonce-7" });

    expect(stale.status).toBe(401);
    expect(first.status).toBe(202);
    expect(replay.status).toBe(409);
    expect(ingest.events).toHaveLength(1);
  });

  test("applies the payload size limit before ingestion", async () => {
    const ingest = new RecordingIngestPort();
    const server = await startServer(ingest, { maxPayloadBytes: 12 });
    const body = JSON.stringify(codexPreToolUse);

    const response = await postSigned(server, "/v1/events/codex", body, { nonce: "nonce-8" });

    expect(response.status).toBe(413);
    expect(ingest.events).toHaveLength(0);
  });

  test("does not expose secrets in error responses", async () => {
    const ingest = new RecordingIngestPort();
    const server = await startServer(ingest);
    const secretBearingBody = JSON.stringify({
      message: "Authorization: Bearer secret-token",
      command: "echo OPENAI_API_KEY=sk-test-1234567890"
    });

    const response = await postSigned(server, "/v1/events/codex", secretBearingBody, {
      nonce: "nonce-9",
      signature: "sha256=wrong"
    });
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("sk-test-1234567890");
    expect(text).not.toContain(secret);
  });

  async function startServer(
    ingestPort: RawEventIngestPort,
    overrides: { maxPayloadBytes?: number } = {}
  ) {
    const server = createLocalHttpIngestServer({
      ingestPort,
      hmacSecret: secret,
      runId,
      trialId,
      maxPayloadBytes: overrides.maxPayloadBytes,
      now: () => new Date()
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    return server;
  }

  async function postSigned(
    server: { address: () => AddressInfo | string | null },
    path: string,
    body: string,
    overrides: { nonce: string; timestamp?: string; signature?: string }
  ): Promise<Response> {
    const timestamp = overrides.timestamp ?? new Date().toISOString();
    const signature = overrides.signature ?? sign(secret, timestamp, overrides.nonce, body);

    return fetch(urlFor(server, path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bmh-timestamp": timestamp,
        "x-bmh-nonce": overrides.nonce,
        "x-bmh-signature": signature
      },
      body
    });
  }
});

class RecordingIngestPort implements RawEventIngestPort {
  readonly events: AppendRawHookEventInput[] = [];

  async ingest(input: AppendRawHookEventInput): Promise<void> {
    this.events.push(input);
  }
}

function sign(secret: string, timestamp: string, nonce: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex")}`;
}

function urlFor(server: { address: () => AddressInfo | string | null }, path: string): string {
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("server is not listening on a TCP port");
  }

  return `http://127.0.0.1:${address.port}${path}`;
}
