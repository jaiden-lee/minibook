import type { ProgressRecord, ResolvedProgress } from "@minibook/shared-types";

export const PAGE_BACKWARD_GUARD = 5;
export const LOGICAL_PROGRESS_BACKWARD_GUARD = 0.03;

export function computeLogicalProgress(page: number, totalPages: number): number {
  if (totalPages <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, page / totalPages));
}

export function createResolvedProgress(
  source: ResolvedProgress["source"],
  record: ProgressRecord | null,
  reason: string,
): ResolvedProgress {
  return {
    source,
    record,
    reason,
  };
}

export function isSuspiciousBackwardProgress(
  candidate: ProgressRecord,
  baseline: ProgressRecord,
): boolean {
  const pageDelta = baseline.page - candidate.page;
  const logicalDelta = baseline.logical_progress - candidate.logical_progress;

  return pageDelta > PAGE_BACKWARD_GUARD || logicalDelta > LOGICAL_PROGRESS_BACKWARD_GUARD;
}
