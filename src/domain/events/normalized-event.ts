import { z } from "zod";

export const HarnessProviderSchema = z.enum(["codex", "claude_code"]);
export type HarnessProvider = z.infer<typeof HarnessProviderSchema>;

export const CanonicalEventTypeSchema = z.enum([
  "session.started",
  "session.ended",
  "turn.started",
  "turn.ended",
  "message.input",
  "message.output",
  "tool.requested",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "tool.denied",
  "command.started",
  "command.completed",
  "file.read",
  "file.written",
  "approval.requested",
  "approval.resolved",
  "context.compacted",
  "notification.emitted",
  "metric.recorded",
  "artifact.created",
  "error.raised",
  "instrumentation.installed",
  "instrumentation.failed",
  "instrumentation.uninstalled",
  "instrumentation.partial",
  "usage_capture.started",
  "usage_capture.completed",
  "usage_capture.unavailable"
]);
export type CanonicalEventType = z.infer<typeof CanonicalEventTypeSchema>;

export const DataQualitySourceSchema = z.enum([
  "native",
  "derived",
  "estimated",
  "observed",
  "unavailable",
  "best_effort",
  "partial",
  "full"
]);
export type DataQualitySource = z.infer<typeof DataQualitySourceSchema>;

const NonEmptyStringSchema = z.string().min(1);
const IsoDateTimeSchema = z.string().datetime();

export const NormalizedEventSchema = z.object({
  schema_version: z.literal("bmh.event.v1"),
  event_id: NonEmptyStringSchema,
  idempotency_key: NonEmptyStringSchema,
  provider: HarnessProviderSchema,
  provider_event_type: NonEmptyStringSchema,
  event_type: CanonicalEventTypeSchema,
  occurred_at: IsoDateTimeSchema,
  observed_at: IsoDateTimeSchema,
  sequence: z.number().int().nonnegative().optional(),
  source: z.object({
    transport: NonEmptyStringSchema,
    adapter_version: NonEmptyStringSchema.optional(),
    host: NonEmptyStringSchema.optional(),
    process_id: z.number().int().nonnegative().optional(),
    evidence: z.object({
      kind: NonEmptyStringSchema,
      reference: NonEmptyStringSchema
    }).optional()
  }),
  workspace: z.object({
    id: NonEmptyStringSchema.optional(),
    root: NonEmptyStringSchema.optional(),
    repo_url: NonEmptyStringSchema.optional(),
    git_sha: NonEmptyStringSchema.optional(),
    branch: NonEmptyStringSchema.optional()
  }).optional(),
  run: z.object({
    run_id: NonEmptyStringSchema,
    trial_id: NonEmptyStringSchema.optional(),
    session_id: NonEmptyStringSchema.optional(),
    turn_id: NonEmptyStringSchema.optional(),
    parent_event_id: NonEmptyStringSchema.nullable().optional()
  }),
  actor: z.object({
    type: NonEmptyStringSchema,
    name: NonEmptyStringSchema.optional(),
    user_id: NonEmptyStringSchema.nullable().optional()
  }).optional(),
  action: z.object({
    name: NonEmptyStringSchema.optional(),
    category: NonEmptyStringSchema.optional(),
    status: NonEmptyStringSchema
  }),
  payload: z.record(z.string(), z.unknown()),
  raw_ref: z.object({
    raw_event_id: NonEmptyStringSchema,
    payload_hash: NonEmptyStringSchema
  }).optional(),
  quality: z.object({
    identity: DataQualitySourceSchema.optional(),
    timestamp: DataQualitySourceSchema.optional(),
    ordering: DataQualitySourceSchema.optional(),
    payload_completeness: DataQualitySourceSchema.optional(),
    session: DataQualitySourceSchema.optional(),
    turn: DataQualitySourceSchema.optional(),
    tool_call: DataQualitySourceSchema.optional(),
    usage: DataQualitySourceSchema.optional(),
    context: DataQualitySourceSchema.optional()
  }),
  security: z.object({
    redaction_applied: z.boolean().optional(),
    secret_scan_status: NonEmptyStringSchema.optional()
  }).optional()
}).superRefine((event, context) => {
  if (event.raw_ref !== undefined) {
    return;
  }

  if (event.source.transport === "system" && event.source.evidence !== undefined) {
    return;
  }

  context.addIssue({
    code: "custom",
    path: ["raw_ref"],
    message: "normalized events require raw_ref or explicit system source evidence"
  });
});

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
