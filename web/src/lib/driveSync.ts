import type { ProgressRecord, RemoteProgressFile } from "@minibook/shared-types";

export type SyncBookResult = {
  synced: boolean;
  remoteFileCount: number;
  progress: ProgressRecord;
};

export async function syncBookProgressToDrive(bookId: string, progress: ProgressRecord): Promise<SyncBookResult> {
  const response = await fetch("/api/drive/sync-book", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bookId,
      progress,
    }),
  });

  if (!response.ok) {
    throw await createApiError(response, "Drive sync failed.");
  }

  return response.json() as Promise<SyncBookResult>;
}

export async function readRemoteBookProgress(bookId: string) {
  const response = await fetch(`/api/drive/book-progress/${encodeURIComponent(bookId)}`);
  if (!response.ok) {
    throw await createApiError(response, "Unable to load Drive progress.");
  }

  return response.json() as Promise<{ files: RemoteProgressFile[] }>;
}

export function syncBookProgressToDriveKeepalive(bookId: string, progress: ProgressRecord) {
  const payload = JSON.stringify({
    bookId,
    progress,
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });
    if (navigator.sendBeacon("/api/drive/sync-book", blob)) {
      return;
    }
  }

  void fetch("/api/drive/sync-book", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

async function createApiError(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return new Error(body.error ?? fallbackMessage);
  } catch {
    return new Error(fallbackMessage);
  }
}
