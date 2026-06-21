import { execFile } from "node:child_process";

import type { GitHistoryInspectorPort } from "../../../application/ports/git-history-inspector-port.js";
import type { GitHistoryEvidence } from "../../../domain/benchmark/spec-catalog.js";

export interface GitCommitRangeEntry {
  readonly commit: string;
  readonly parent: string;
  readonly subject: string;
}

export class ProcessGitHistoryInspector implements GitHistoryInspectorPort {
  public async inspectRange(input: { readonly repoPath: string; readonly baseRef: string; readonly goldenRef: string }): Promise<GitHistoryEvidence> {
    const changedFiles = splitLines(await git(input.repoPath, ["diff", "--name-only", input.baseRef, input.goldenRef])).sort();
    const commitMessages = splitLines(await git(input.repoPath, ["log", "--format=%s", `${input.baseRef}..${input.goldenRef}`]));
    const diffSummary = await git(input.repoPath, ["diff", "--stat", input.baseRef, input.goldenRef]);

    return {
      baseRef: input.baseRef,
      goldenRef: input.goldenRef,
      changedFiles,
      commitMessages,
      diffSummary
    };
  }

  public async listCandidateRanges(input: { readonly repoPath: string; readonly range: string; readonly limit: number }): Promise<readonly GitHistoryEvidence[]> {
    const commits = await this.commits(input);

    return Promise.all(
      commits.map((entry) => this.inspectRange({
        repoPath: input.repoPath,
        baseRef: entry.parent,
        goldenRef: entry.commit
      }))
    );
  }

  public async inspect(input: { readonly repoPath: string; readonly baseRef: string; readonly goldenRef: string }): Promise<GitHistoryEvidence> {
    return this.inspectRange(input);
  }

  public async commits(input: { readonly repoPath: string; readonly range: string; readonly limit: number }): Promise<GitCommitRangeEntry[]> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) {
      throw new Error(`expected a positive integer, got: ${input.limit}`);
    }

    const commits = splitLines(await git(input.repoPath, ["rev-list", "--reverse", `--max-count=${input.limit}`, input.range]));
    const entries = await Promise.all(
      commits.map(async (commit) => {
        const [parent, subject] = await Promise.all([
          git(input.repoPath, ["rev-parse", `${commit}^`]).catch(() => ""),
          git(input.repoPath, ["log", "-1", "--format=%s", commit])
        ]);

        return {
          commit,
          parent: parent.trim(),
          subject: subject.trim()
        };
      })
    );

    return entries.filter((entry) => entry.parent.length > 0);
  }
}

function git(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
