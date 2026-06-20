import type { MetricObservation } from "../../domain/metrics/metric-observation.js";
import type { HarnessProvider } from "./raw-event-store.js";

export type StoredMetricObservation = MetricObservation;

export interface MetricListFilter {
  provider?: HarnessProvider;
  run_id?: string;
  trial_id?: string;
  metric?: string;
  supporting_event_id?: string;
  supporting_artifact_id?: string;
}

export interface MetricStore {
  append(input: MetricObservation): Promise<StoredMetricObservation>;
  count(): Promise<number>;
  list(filter?: MetricListFilter): Promise<StoredMetricObservation[]>;
}
