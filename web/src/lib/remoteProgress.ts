import type { ProgressRecord, RemoteProgressInsight } from "@minibook/shared-types";
import { summarizeRemoteProgress } from "@minibook/sync-core";
import { readRemoteBookProgress } from "@/lib/driveSync";
import { getOrCreateDeviceId } from "@/lib/id";

export async function loadRemoteProgressInsight(
  bookId: string,
  localProgress?: ProgressRecord | null,
): Promise<RemoteProgressInsight> {
  const remoteResult = await readRemoteBookProgress(bookId);
  const remoteRecords = remoteResult.files
    .map((entry) => entry.record)
    .filter((entry): entry is ProgressRecord => entry !== null);

  return summarizeRemoteProgress(localProgress ?? null, remoteRecords, getOrCreateDeviceId());
}

export function getRemoteInsightMessage(insight: RemoteProgressInsight): string | null {
  if (insight.newer_remote_other_available && insight.latest_other_device_record) {
    return `Newer progress exists on another device at page ${insight.latest_other_device_record.page}.`;
  }

  if (insight.other_device_count > 0) {
    return `${insight.device_count} synced device${insight.device_count === 1 ? "" : "s"}.`;
  }

  if (insight.latest_remote_updated_at) {
    return `Last synced ${formatRelativeTime(insight.latest_remote_updated_at)}.`;
  }

  return null;
}

export function getReaderRemoteNotice(insight: RemoteProgressInsight): string | null {
  if (!insight.newer_remote_other_available || !insight.latest_other_device_record) {
    return null;
  }

  return `Newer progress is available from another device at page ${insight.latest_other_device_record.page}. It will be used next time you open this book.`;
}

export function formatRelativeTime(timestamp: number): string {
  const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));

  if (deltaSeconds < 60) {
    return "just now";
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}
