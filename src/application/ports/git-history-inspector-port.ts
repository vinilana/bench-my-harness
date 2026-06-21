import type { GitHistoryEvidence } from "../../domain/benchmark/spec-catalog.js";

export interface GitHistoryInspectorPort {
  inspectRange(input: {
    repoPath: string;
    baseRef: string;
    goldenRef: string;
  }): Promise<GitHistoryEvidence>;

  listCandidateRanges(input: {
    repoPath: string;
    range: string;
    limit: number;
  }): Promise<readonly GitHistoryEvidence[]>;
}
