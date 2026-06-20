import type {
  MetricObservation,
  UsageCaptureContext,
  UsageCapturePort
} from "../../../application/ports/usage-capture-port.js";

interface InMemoryUsageCaptureOptions {
  readonly available: boolean;
  readonly observations?: readonly MetricObservation[];
}

const UNAVAILABLE_USAGE_METRICS = [
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "context_tokens",
  "cost_usd"
] as const;

export class InMemoryUsageCapture implements UsageCapturePort {
  readonly #available: boolean;
  readonly #observations: readonly MetricObservation[];

  constructor(options: InMemoryUsageCaptureOptions) {
    this.#available = options.available;
    this.#observations = options.observations ?? [];
  }

  async capture(_context: UsageCaptureContext): Promise<readonly MetricObservation[]> {
    if (!this.#available) {
      return UNAVAILABLE_USAGE_METRICS.map((metric) => ({
        metric,
        value: null,
        measurement_source: "unavailable",
        capture_source: "none",
        confidence: "none"
      }));
    }

    return this.#observations;
  }
}
