import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ReportState, ReportStore } from "../../../application/ports/report-store.js";
import { redactSecrets } from "../../../domain/security/redact-secrets.js";

export interface FilesystemReportStoreOptions {
  readonly root: string;
}

export class FilesystemReportStore implements ReportStore {
  public constructor(private readonly options: FilesystemReportStoreOptions) {}

  public async save(input: ReportState): Promise<ReportState> {
    const sanitized = sanitizeReportState(input);
    const dir = this.runDir(sanitized.run_id);

    await mkdir(dir, { recursive: true });
    await writeFile(this.reportPath(sanitized.run_id), `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");

    return cloneReportState(sanitized);
  }

  public async findByRunId(runId: string): Promise<ReportState | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.reportPath(runId), "utf8")) as unknown;
      return sanitizeReportState(parsed as ReportState);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined;
      }

      throw new Error(`stored report could not be loaded for run ${runId}`);
    }
  }

  private reportPath(runId: string): string {
    return join(this.runDir(runId), "report.json");
  }

  private runDir(runId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
      throw new Error("invalid run id for report storage");
    }

    return join(this.options.root, runId);
  }
}

function sanitizeReportState(input: ReportState): ReportState {
  const sanitized = redactUnknown(input) as ReportState & { raw_payloads?: unknown };
  const { raw_payloads: _rawPayloads, ...withoutRawPayloads } = sanitized;

  return {
    ...withoutRawPayloads,
    security: {
      ...withoutRawPayloads.security,
      redaction: {
        ...withoutRawPayloads.security.redaction,
        raw_payloads_included: false
      }
    }
  };
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
        key === "raw_payloads" || nested === undefined ? [] : [[key, redactUnknown(nested)]]
      )
    );
  }

  return value;
}

function cloneReportState(state: ReportState): ReportState {
  return JSON.parse(JSON.stringify(state)) as ReportState;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
