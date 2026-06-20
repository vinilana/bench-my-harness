import { deriveMetrics, type DeriveMetricsInput } from "../../domain/metrics/derived-metrics.js";
import type { MetricObservation } from "../../domain/metrics/metric-observation.js";

export type ComputeMetricsInput = DeriveMetricsInput;

export function computeMetrics(input: ComputeMetricsInput): MetricObservation[] {
  return deriveMetrics(input);
}
