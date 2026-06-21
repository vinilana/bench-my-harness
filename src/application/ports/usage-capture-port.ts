import { z } from "zod";

export type UsageProvider = "codex" | "claude_code";

const NonEmptyStringSchema = z.string().min(1);

export const MeasurementSourceSchema = z.enum([
  "native",
  "observed",
  "derived",
  "estimated",
  "unavailable"
]);
export type MeasurementSource = z.infer<typeof MeasurementSourceSchema>;

export const MeasurementConfidenceSchema = z.enum(["high", "medium", "low", "none"]);
export type MeasurementConfidence = z.infer<typeof MeasurementConfidenceSchema>;

export interface UsageCaptureContext {
  readonly provider: UsageProvider;
  readonly runId: string;
  readonly trialId: string;
  readonly workspace?: string;
  readonly hookSpoolPath?: string;
  readonly transcriptPath?: string;
  readonly processStdout?: string;
  readonly processStderr?: string;
  readonly processStdoutPath?: string;
  readonly processStderrPath?: string;
  readonly statusLineJsonlPath?: string;
}

export interface MetricObservation {
  readonly metric: string;
  readonly value?: number | null;
  readonly unit?: string;
  readonly measurement_source: MeasurementSource;
  readonly capture_source: string;
  readonly confidence: MeasurementConfidence;
  readonly unavailable_reason?: string;
  readonly evidence_refs?: readonly string[];
}

export interface UsageCapturePort {
  capture(context: UsageCaptureContext): Promise<readonly MetricObservation[]>;
}

export const UsageEvidenceSchema = z.object({
  measurement_source: MeasurementSourceSchema,
  capture_source: NonEmptyStringSchema,
  confidence: MeasurementConfidenceSchema,
  evidence_refs: z.array(NonEmptyStringSchema).optional()
});
export type UsageEvidence = z.infer<typeof UsageEvidenceSchema>;

export const UsageValueObservationSchema = UsageEvidenceSchema.extend({
  value: z.number().finite().nullable(),
  unit: NonEmptyStringSchema,
  unavailable_reason: NonEmptyStringSchema.optional()
}).superRefine((value, ctx) => {
  if (value.measurement_source === "unavailable" && value.unavailable_reason === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["unavailable_reason"],
      message: "unavailable usage observations must include unavailable_reason"
    });
  }
});
export type UsageValueObservation = z.infer<typeof UsageValueObservationSchema>;

export const UsageLlmObservationSchema = UsageEvidenceSchema.extend({
  model: NonEmptyStringSchema,
  provider: NonEmptyStringSchema,
  role: z.enum(["primary", "subagent"])
});
export type UsageLlmObservation = z.infer<typeof UsageLlmObservationSchema>;

export const UsageSkillObservationSchema = UsageEvidenceSchema.extend({
  name: NonEmptyStringSchema,
  source: z.enum(["codex", "claude_code"]),
  invocation: z.enum(["explicit", "implicit", "unknown"])
});
export type UsageSkillObservation = z.infer<typeof UsageSkillObservationSchema>;

export const UsageMcpObservationSchema = UsageEvidenceSchema.extend({
  server: NonEmptyStringSchema,
  tool: NonEmptyStringSchema,
  call_count: z.number().int().nonnegative()
});
export type UsageMcpObservation = z.infer<typeof UsageMcpObservationSchema>;

export const UsageSubagentObservationSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema.optional(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  llms: z.array(UsageLlmObservationSchema),
  tokens: z.object({
    total: UsageValueObservationSchema
  }),
  cost: z.object({
    total_usd: UsageValueObservationSchema
  }),
  evidence_refs: z.array(NonEmptyStringSchema)
});
export type UsageSubagentObservation = z.infer<typeof UsageSubagentObservationSchema>;

export const UsageCoverageStatusSchema = z.enum(["available", "partial", "unavailable"]);
export type UsageCoverageStatus = z.infer<typeof UsageCoverageStatusSchema>;

export const UsageReportSchema = z.object({
  llms: z.array(UsageLlmObservationSchema),
  tokens: z.object({
    total: UsageValueObservationSchema.nullable(),
    input: UsageValueObservationSchema.nullable(),
    output: UsageValueObservationSchema.nullable(),
    cache_read: UsageValueObservationSchema.nullable(),
    cache_write: UsageValueObservationSchema.nullable()
  }),
  cost: z.object({
    total_usd: UsageValueObservationSchema
  }),
  subagents: z.array(UsageSubagentObservationSchema),
  skills: z.array(UsageSkillObservationSchema),
  mcps: z.array(UsageMcpObservationSchema),
  coverage: z.object({
    model: UsageCoverageStatusSchema,
    tokens: UsageCoverageStatusSchema,
    cost: UsageCoverageStatusSchema,
    subagents: UsageCoverageStatusSchema,
    skills: UsageCoverageStatusSchema,
    mcp: UsageCoverageStatusSchema
  })
});
export type UsageReport = z.infer<typeof UsageReportSchema>;

export interface NormalizedUsageCapturePort extends UsageCapturePort {
  captureUsage(context: UsageCaptureContext): Promise<UsageReport>;
}
