import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { redactSecrets } from "../../../domain/security/redact-secrets.js";

export type HookCaptureProvider = "codex" | "claude_code";

export interface HookCaptureOptions {
  readonly provider: HookCaptureProvider;
  readonly event: string;
  readonly runId: string;
  readonly trialId: string;
  readonly stdin: string;
  readonly spoolPath: string;
  readonly ingestUrl?: string;
  readonly maxPayloadBytes?: number;
  readonly strict?: boolean;
}

export interface HookCaptureResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly persisted: boolean;
}

export async function runHookCapture(
  options: HookCaptureOptions
): Promise<HookCaptureResult> {
  try {
    validatePayloadSize(options.stdin, options.maxPayloadBytes ?? 1024 * 1024);

    const rawPayload = parseHookPayload(options.stdin);
    const envelope = buildReportableEnvelope(options, rawPayload);
    const reportableJson = JSON.stringify(envelope);
    const redaction = redactSecrets(reportableJson);
    const redactedEnvelope = JSON.parse(redaction.redacted) as Record<string, unknown>;

    redactedEnvelope.security = {
      redaction_applied: redaction.redactionApplied,
      secret_scan_status: "passed",
      original_payload_hash: redaction.originalHash,
      redaction_hashes: redaction.findings.map((finding) => finding.hash)
    };

    const persistence = await persistHookEvent(options, redactedEnvelope);

    return {
      exitCode: 0,
      stdout: hookProtocolResponse(options.provider),
      stderr: persistence.warning ?? "",
      persisted: true
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options.strict) {
      return {
        exitCode: 1,
        stdout: hookProtocolResponse(options.provider),
        stderr: message,
        persisted: false
      };
    }

    return {
      exitCode: 0,
      stdout: hookProtocolResponse(options.provider),
      stderr: message,
      persisted: false
    };
  }
}

function validatePayloadSize(stdin: string, maxPayloadBytes: number): void {
  const payloadBytes = Buffer.byteLength(stdin, "utf8");

  if (payloadBytes > maxPayloadBytes) {
    throw new Error(`hook payload exceeds ${maxPayloadBytes} bytes`);
  }
}

function parseHookPayload(stdin: string): unknown {
  const trimmed = stdin.trim();

  if (trimmed.length === 0) {
    throw new Error("hook-capture expected one JSON event on stdin");
  }

  const parsed = JSON.parse(trimmed) as unknown;

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("hook-capture expected a JSON object event");
  }

  return parsed;
}

async function persistHookEvent(
  options: HookCaptureOptions,
  event: Record<string, unknown>
): Promise<{ warning?: string }> {
  const jsonLine = `${JSON.stringify(event)}\n`;

  if (!options.ingestUrl) {
    await mkdir(dirname(options.spoolPath), { recursive: true });
    await appendFile(options.spoolPath, jsonLine, "utf8");
    return {};
  }

  try {
    const response = await fetch(options.ingestUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      throw new Error(`ingest endpoint returned ${response.status}`);
    }

    return {};
  } catch (error) {
    await mkdir(dirname(options.spoolPath), { recursive: true });
    await appendFile(options.spoolPath, jsonLine, "utf8");
    const message = error instanceof Error ? error.message : String(error);
    return { warning: `ingest unavailable; spooled event: ${message}` };
  }
}

function buildReportableEnvelope(
  options: HookCaptureOptions,
  rawPayload: unknown
): Record<string, unknown> {
  return {
    schema_version: "bmh.hook_capture.v1",
    provider: options.provider,
    event: options.event,
    run_id: options.runId,
    trial_id: options.trialId,
    captured_at: new Date().toISOString(),
    payload: rawPayload,
    security: {
      redaction_applied: false,
      secret_scan_status: "pending"
    }
  };
}

function hookProtocolResponse(provider: HookCaptureProvider): string {
  if (provider === "claude_code") {
    return "{}";
  }

  return "";
}
