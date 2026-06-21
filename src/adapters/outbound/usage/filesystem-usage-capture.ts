import type {
  MetricObservation,
  NormalizedUsageCapturePort,
  UsageCaptureContext,
  UsageReport
} from "../../../application/ports/usage-capture-port.js";
import { ClaudeCodeUsageCapture } from "./claude-code-usage-capture.js";
import { CodexUsageCapture } from "./codex-usage-capture.js";

export class FilesystemUsageCapture implements NormalizedUsageCapturePort {
  public async capture(context: UsageCaptureContext): Promise<readonly MetricObservation[]> {
    return this.captureFor(context).capture(context);
  }

  public async captureUsage(context: UsageCaptureContext): Promise<UsageReport> {
    return this.captureFor(context).captureUsage(context);
  }

  private captureFor(context: UsageCaptureContext): NormalizedUsageCapturePort {
    return context.provider === "codex"
      ? new CodexUsageCapture({})
      : new ClaudeCodeUsageCapture({});
  }
}
