import type {
  MetricListFilter,
  MetricStore,
  StoredMetricObservation
} from "../../../application/ports/metric-store.js";

export class InMemoryMetricStore implements MetricStore {
  private readonly recordsByIdempotencyKey = new Map<string, StoredMetricObservation>();

  async append(input: StoredMetricObservation): Promise<StoredMetricObservation> {
    const idempotencyKey = toMetricIdempotencyKey(input);
    const existing = this.recordsByIdempotencyKey.get(idempotencyKey);

    if (existing !== undefined) {
      return cloneMetric(existing);
    }

    const stored = cloneMetric(input);
    this.recordsByIdempotencyKey.set(idempotencyKey, stored);

    return cloneMetric(stored);
  }

  async count(): Promise<number> {
    return this.recordsByIdempotencyKey.size;
  }

  async list(filter: MetricListFilter = {}): Promise<StoredMetricObservation[]> {
    return Array.from(this.recordsByIdempotencyKey.values())
      .filter((metric) => matchesMetricFilter(metric, filter))
      .map((metric) => cloneMetric(metric));
  }
}

function toMetricIdempotencyKey(metric: StoredMetricObservation): string {
  return [
    metric.run_id,
    metric.trial_id ?? "",
    metric.metric,
    metric.supporting_event_id ?? "",
    metric.supporting_artifact_id ?? ""
  ].join(":");
}

function matchesMetricFilter(metric: StoredMetricObservation, filter: MetricListFilter): boolean {
  return (
    (filter.provider === undefined || metric.provider === filter.provider) &&
    (filter.run_id === undefined || metric.run_id === filter.run_id) &&
    (filter.trial_id === undefined || metric.trial_id === filter.trial_id) &&
    (filter.metric === undefined || metric.metric === filter.metric) &&
    (filter.supporting_event_id === undefined || metric.supporting_event_id === filter.supporting_event_id) &&
    (filter.supporting_artifact_id === undefined || metric.supporting_artifact_id === filter.supporting_artifact_id)
  );
}

function cloneMetric(metric: StoredMetricObservation): StoredMetricObservation {
  return JSON.parse(JSON.stringify(metric)) as StoredMetricObservation;
}
