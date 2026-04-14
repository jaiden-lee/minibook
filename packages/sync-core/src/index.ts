import type { ProgressRecord, RemoteProgressInsight, ResolvedProgress } from "@minibook/shared-types";

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

export function resolveProgressRecord(
  localRecord: ProgressRecord | null | undefined,
  remoteRecords: ProgressRecord[],
  deviceId: string,
): ResolvedProgress {
  const records = [
    ...(localRecord ? [{ source: "local" as const, record: localRecord }] : []),
    ...remoteRecords.map((record) => ({
      source: (record.device_id === deviceId ? "remote-self" : "remote-other") as ResolvedProgress["source"],
      record,
    })),
  ];

  if (!records.length) {
    return createResolvedProgress("local", null, "No local or remote progress exists yet.");
  }

  const newest = [...records].sort(compareProgressByRecency)[0];
  const furthest = [...records].sort(compareProgressByDistance)[0];

  if (newest && furthest && newest.record !== furthest.record && isSuspiciousBackwardProgress(newest.record, furthest.record)) {
    return createResolvedProgress(
      furthest.source,
      furthest.record,
      `Kept further progress because the newest record was suspiciously behind by more than ${PAGE_BACKWARD_GUARD} pages or ${Math.round(LOGICAL_PROGRESS_BACKWARD_GUARD * 100)}%.`,
    );
  }

  return createResolvedProgress(
    newest.source,
    newest.record,
    newest.source === "local"
      ? "Used local progress because it is the newest valid record."
      : "Used the newest valid remote progress.",
  );
}

export function summarizeRemoteProgress(
  localRecord: ProgressRecord | null | undefined,
  remoteRecords: ProgressRecord[],
  deviceId: string,
): RemoteProgressInsight {
  const newestRemote = [...remoteRecords].sort(compareRecordByRecency)[0] ?? null;
  const newestRemoteOther = [...remoteRecords]
    .filter((record) => record.device_id !== deviceId)
    .sort(compareRecordByRecency)[0] ?? null;
  const deviceIds = new Set(remoteRecords.map((record) => record.device_id));
  const baseline = localRecord ?? newestRemote;
  const newerRemoteOtherAvailable = !!(
    newestRemoteOther &&
    (!baseline || newestRemoteOther.updated_at > baseline.updated_at) &&
    (!baseline || !isSuspiciousBackwardProgress(newestRemoteOther, baseline))
  );

  let newestSource: RemoteProgressInsight["newest_source"] = "none";
  if (newestRemote) {
    newestSource = newestRemote.device_id === deviceId ? "remote-self" : "remote-other";
  }

  return {
    device_count: deviceIds.size,
    other_device_count: new Set(
      remoteRecords
        .filter((record) => record.device_id !== deviceId)
        .map((record) => record.device_id),
    ).size,
    latest_remote_updated_at: newestRemote?.updated_at ?? null,
    latest_remote_device_id: newestRemote?.device_id ?? null,
    latest_remote_record: newestRemote,
    latest_other_device_record: newestRemoteOther,
    newest_source: newestSource,
    newer_remote_other_available: newerRemoteOtherAvailable,
  };
}

function compareProgressByRecency(
  left: { record: ProgressRecord },
  right: { record: ProgressRecord },
) {
  if (left.record.updated_at !== right.record.updated_at) {
    return right.record.updated_at - left.record.updated_at;
  }

  return compareProgressByDistance(left, right);
}

function compareProgressByDistance(
  left: { record: ProgressRecord },
  right: { record: ProgressRecord },
) {
  if (left.record.logical_progress !== right.record.logical_progress) {
    return right.record.logical_progress - left.record.logical_progress;
  }

  if (left.record.page !== right.record.page) {
    return right.record.page - left.record.page;
  }

  if (left.record.position_in_page !== right.record.position_in_page) {
    return right.record.position_in_page - left.record.position_in_page;
  }

  return right.record.updated_at - left.record.updated_at;
}

function compareRecordByRecency(left: ProgressRecord, right: ProgressRecord) {
  return compareProgressByRecency({ record: left }, { record: right });
}
