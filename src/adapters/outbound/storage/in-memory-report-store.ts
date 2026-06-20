import type { ReportState, ReportStore } from "../../../application/ports/report-store.js";

export class InMemoryReportStore implements ReportStore {
  private readonly recordsByRunId = new Map<string, ReportState>();

  async save(input: ReportState): Promise<ReportState> {
    const existing = this.recordsByRunId.get(input.run_id);

    if (existing !== undefined) {
      return cloneReportState(existing);
    }

    const stored = cloneReportState(input);
    this.recordsByRunId.set(stored.run_id, stored);

    return cloneReportState(stored);
  }

  async findByRunId(runId: string): Promise<ReportState | undefined> {
    const state = this.recordsByRunId.get(runId);
    return state === undefined ? undefined : cloneReportState(state);
  }
}

function cloneReportState(state: ReportState): ReportState {
  return JSON.parse(JSON.stringify(state)) as ReportState;
}
