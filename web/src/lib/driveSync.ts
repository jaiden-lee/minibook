import type { ProgressRecord } from "@minibook/shared-types";
import { listBookProgressFiles, upsertBookProgressFile } from "@minibook/drive-client";
import { getProgress } from "@/lib/db";
import { getOrCreateDeviceId } from "@/lib/id";

export type SyncBookResult = {
  uploadedRecord: ProgressRecord;
  remoteFileCount: number;
};

export async function syncBookProgressToDrive(accessToken: string, bookId: string, progress?: ProgressRecord): Promise<SyncBookResult> {
  const localProgress = progress ?? (await getProgress(bookId));

  if (!localProgress) {
    throw new Error("This book does not have saved local progress yet.");
  }

  const deviceId = getOrCreateDeviceId();
  await upsertBookProgressFile(accessToken, bookId, deviceId, localProgress);
  const remoteFiles = await listBookProgressFiles(accessToken, bookId);

  return {
    uploadedRecord: localProgress,
    remoteFileCount: remoteFiles.length,
  };
}

export async function readRemoteBookProgress(accessToken: string, bookId: string) {
  return listBookProgressFiles(accessToken, bookId);
}
