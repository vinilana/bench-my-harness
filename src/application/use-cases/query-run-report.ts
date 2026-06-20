import type { ArtifactStore } from "../ports/artifact-store.js";
import type { MetricStore } from "../ports/metric-store.js";
import type { NormalizedEventStore } from "../ports/normalized-event-store.js";
import type { RawEventStore } from "../ports/raw-event-store.js";
import type { ReportStore } from "../ports/report-store.js";
import type { BenchmarkReport } from "../../domain/reports/report-model.js";
import { redactSecrets } from "../../domain/security/redact-secrets.js";

export interface QueryRunReportInput {
  run_id: string;
  reportStore: ReportStore;
  metricStore: MetricStore;
  artifactStore: ArtifactStore;
  rawEventStore: RawEventStore;
  normalizedEventStore: NormalizedEventStore;
}

export async function queryRunReport(input: QueryRunReportInput): Promise<BenchmarkReport> {
  const reportState = await input.reportStore.findByRunId(input.run_id);

  if (reportState === undefined) {
    throw new Error(`Report state not found for run ${input.run_id}`);
  }

  const [metrics] = await Promise.all([
    input.metricStore.list({ run_id: input.run_id }),
    input.artifactStore.list({ run_id: input.run_id }),
    input.rawEventStore.list({ run_id: input.run_id }),
    input.normalizedEventStore.list({ run_id: input.run_id })
  ]);

  return redactUnknown({
    ...reportState,
    metrics,
    security: {
      ...reportState.security,
      redaction: {
        ...reportState.security.redaction,
        raw_payloads_included: false
      }
    }
  }) as BenchmarkReport;
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSecrets(value).redacted;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nested]) =>
        nested === undefined ? [] : [[key, redactUnknown(nested)]]
      )
    );
  }

  return value;
}
