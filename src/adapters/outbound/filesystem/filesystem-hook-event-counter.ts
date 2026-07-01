import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type {
  HookEventCounterPort,
  HookEventMetricInput
} from "../../../application/ports/hook-event-counter-port.js";
import type { JsonValue, RawHookEvent } from "../../../application/ports/raw-event-store.js";
import type { MetricObservation } from "../../../application/ports/usage-capture-port.js";
import { computeMetrics } from "../../../application/use-cases/compute-metrics.js";
import { NormalizedEventSchema } from "../../../domain/events/normalized-event.js";
import { sha256 } from "../../../domain/security/redact-secrets.js";
import { normalizeRawHookEvent } from "../harnesses/provider-raw-hook-event-normalizer.js";

export class FilesystemHookEventCounter implements HookEventCounterPort {
  public async count(input: { readonly spoolPath: string }): Promise<number> {
    try {
      const contents = await readFile(input.spoolPath, "utf8");
      return contents.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    } catch (error) {
      if (isNotFoundError(error)) {
        return 0;
      }

      throw error;
    }
  }

  public async metrics(input: HookEventMetricInput): Promise<readonly MetricObservation[]> {
    let contents: string;

    try {
      contents = await readFile(input.spoolPath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }

      throw error;
    }

    const events = contents
      .split(/\r?\n/)
      .flatMap((line, index) => {
        const raw = rawHookEventFromSpoolLine(line, index, input);
        if (raw === undefined) {
          return [];
        }

        return [NormalizedEventSchema.parse(normalizeRawHookEvent(raw))];
      });

    const metrics = computeMetrics({
      provider: input.provider,
      runId: input.runId,
      trialId: input.trialId,
      observedAt: input.observedAt,
      events,
      artifacts: []
    });

    return metrics.map((metric) => {
      const supportingEventId = "supporting_event_id" in metric ? metric.supporting_event_id : undefined;
      return {
        ...metric,
        evidence_refs: [
          basename(input.spoolPath),
          ...(typeof supportingEventId === "string" ? [`event:${supportingEventId}`] : [])
        ]
      };
    });
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function rawHookEventFromSpoolLine(
  line: string,
  index: number,
  input: HookEventMetricInput
): RawHookEvent | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = parseRecord(trimmed);
  if (parsed === undefined) {
    return undefined;
  }

  const payloadRecord = recordValue(parsed["payload"]) ?? {};
  const eventName = stringValue(parsed["event"]) ?? stringValue(payloadRecord["hook_event_name"]) ?? "unknown";
  const payload = {
    ...payloadRecord,
    hook_event_name: eventName
  };
  const payloadJson = toJsonValue(payload);
  const rawEventId = `raw_hook_${index + 1}`;

  return {
    raw_event_id: rawEventId,
    provider: input.provider,
    run_id: stringValue(parsed["run_id"]) ?? input.runId,
    trial_id: stringValue(parsed["trial_id"]) ?? input.trialId,
    payload: payloadJson,
    payload_hash: sha256(JSON.stringify(payloadJson)),
    observed_at: stringValue(parsed["captured_at"]) ?? input.observedAt,
    duplicate_count: 0,
    security: spoolSecurity(parsed)
  };
}

function parseRecord(line: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    return recordValue(parsed);
  } catch {
    return undefined;
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function secretScanStatus(value: unknown): RawHookEvent["security"]["secret_scan_status"] | undefined {
  return value === "pending" || value === "passed" || value === "failed" ? value : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return strings.length === 0 ? undefined : strings;
}

function spoolSecurity(parsed: Record<string, unknown>): RawHookEvent["security"] {
  const security = recordValue(parsed["security"]);
  const originalPayloadHash = stringValue(security?.["original_payload_hash"]);
  const redactionHashes = stringArrayValue(security?.["redaction_hashes"]);

  return {
    redaction_applied: booleanValue(security?.["redaction_applied"]) ?? false,
    secret_scan_status: secretScanStatus(security?.["secret_scan_status"]) ?? "pending",
    raw_payload_retention: "stored",
    raw_payloads_included: true,
    ...(originalPayloadHash === undefined
      ? {}
      : { original_payload_hash: originalPayloadHash }),
    ...(redactionHashes === undefined
      ? {}
      : { redaction_hashes: redactionHashes })
  };
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)])
    );
  }

  return null;
}
