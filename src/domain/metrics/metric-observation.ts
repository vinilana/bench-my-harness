import { z } from "zod";

import { HarnessProviderSchema } from "../events/normalized-event.js";

const NonEmptyStringSchema = z.string().min(1);
const IsoDateTimeSchema = z.string().datetime();

export const MeasurementSourceSchema = z.enum([
  "native",
  "observed",
  "estimated",
  "derived",
  "unavailable"
]);
export type MeasurementSource = z.infer<typeof MeasurementSourceSchema>;

export const MeasurementConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "none"
]);
export type MeasurementConfidence = z.infer<typeof MeasurementConfidenceSchema>;

export const MetricObservationSchema = z.object({
  metric: NonEmptyStringSchema,
  value: z.number().finite().nullable().optional(),
  unit: NonEmptyStringSchema.optional(),
  measurement_source: MeasurementSourceSchema,
  capture_source: NonEmptyStringSchema,
  confidence: MeasurementConfidenceSchema,
  run_id: NonEmptyStringSchema,
  trial_id: NonEmptyStringSchema.optional(),
  provider: HarnessProviderSchema,
  observed_at: IsoDateTimeSchema,
  supporting_event_id: NonEmptyStringSchema.optional(),
  supporting_artifact_id: NonEmptyStringSchema.optional()
});

export type MetricObservation = z.infer<typeof MetricObservationSchema>;
