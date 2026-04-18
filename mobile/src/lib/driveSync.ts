import type { ProgressRecord, RemoteProgressFile } from "@minibook/shared-types";
import { getValidMobileGoogleAccessToken } from "./auth";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API_BASE = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type DriveFile = {
  id: string;
  name: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
};

export async function readRemoteBookProgress(bookId: string) {
  const accessToken = await getValidMobileGoogleAccessToken();
  const rootFolderId = await findFolder(accessToken, "minibook");
  if (!rootFolderId) {
    return { files: [] satisfies RemoteProgressFile[] };
  }

  const progressFolderId = await findFolder(accessToken, "progress", rootFolderId);
  if (!progressFolderId) {
    return { files: [] satisfies RemoteProgressFile[] };
  }

  const bookFolderId = await findFolder(accessToken, bookId, progressFolderId);
  if (!bookFolderId) {
    return { files: [] satisfies RemoteProgressFile[] };
  }

  const files = await listFiles(accessToken, [
    `'${bookFolderId}' in parents`,
    "trashed = false",
    "mimeType = 'application/json'",
  ].join(" and "), "files(id,name,modifiedTime,appProperties)");

  const remoteFiles = await Promise.all(files.map(async (file) => ({
    fileId: file.id,
    deviceId: file.appProperties?.device_id ?? stripJsonExtension(file.name),
    modifiedTime: file.modifiedTime,
    record: await fetchRemoteProgressFile(accessToken, file.id),
  } satisfies RemoteProgressFile)));

  return { files: remoteFiles };
}

export async function syncBookProgressToDrive(bookId: string, progress: ProgressRecord) {
  const accessToken = await getValidMobileGoogleAccessToken();
  const rootFolderId = await ensureFolder(accessToken, "minibook");
  const progressFolderId = await ensureFolder(accessToken, "progress", rootFolderId);
  const bookFolderId = await ensureFolder(accessToken, bookId, progressFolderId);
  const fileName = `${progress.device_id}.json`;
  const existing = await findFile(accessToken, fileName, bookFolderId);
  const metadata = {
    name: fileName,
    mimeType: "application/json",
    appProperties: {
      book_id: bookId,
      device_id: progress.device_id,
    },
  };
  const body = JSON.stringify(progress);

  if (existing) {
    await uploadMultipart(accessToken, `${DRIVE_UPLOAD_API_BASE}/files/${existing.id}?uploadType=multipart`, metadata, body, "PATCH");
  } else {
    await uploadMultipart(accessToken, `${DRIVE_UPLOAD_API_BASE}/files?uploadType=multipart`, {
      ...metadata,
      parents: [bookFolderId],
    }, body, "POST");
  }

  return {
    synced: true,
    remoteFileCount: 1,
    progress,
  };
}

async function findFolder(accessToken: string, name: string, parentId?: string) {
  const files = await listFiles(accessToken, [
    `name = '${escapeDriveQueryValue(name)}'`,
    `mimeType = '${FOLDER_MIME_TYPE}'`,
    "trashed = false",
    ...(parentId ? [`'${parentId}' in parents`] : []),
  ].join(" and "));

  return files[0]?.id ?? null;
}

async function ensureFolder(accessToken: string, name: string, parentId?: string) {
  const existing = await findFolder(accessToken, name, parentId);
  if (existing) {
    return existing;
  }

  const created = await driveJsonRequest<DriveFile>(`${DRIVE_API_BASE}/files`, accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME_TYPE,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });

  return created.id;
}

async function findFile(accessToken: string, name: string, parentId: string) {
  const files = await listFiles(accessToken, [
    `name = '${escapeDriveQueryValue(name)}'`,
    `'${parentId}' in parents`,
    "trashed = false",
  ].join(" and "), "files(id,name,modifiedTime,appProperties)");

  return files[0] ?? null;
}

async function listFiles(accessToken: string, query: string, fields = "files(id,name,modifiedTime)") {
  const url = new URL(`${DRIVE_API_BASE}/files`);
  url.searchParams.set("q", query);
  url.searchParams.set("fields", fields);
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("supportsAllDrives", "false");

  const payload = await driveJsonRequest<{ files: DriveFile[] }>(url.toString(), accessToken);
  return payload.files ?? [];
}

async function fetchRemoteProgressFile(accessToken: string, fileId: string) {
  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to read remote Drive progress file.");
  }

  return response.json() as Promise<ProgressRecord | null>;
}

async function uploadMultipart(
  accessToken: string,
  url: string,
  metadata: Record<string, unknown>,
  body: string,
  method: "POST" | "PATCH",
) {
  const boundary = `minibook-${Date.now().toString(36)}`;
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    body,
    `--${boundary}--`,
  ].join("\r\n");

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Unable to write progress to Google Drive. ${method} ${url} -> ${response.status} ${response.statusText}${details ? ` | ${details}` : ""}`);
  }
}

async function driveJsonRequest<T>(url: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive request failed. ${init.method ?? "GET"} ${url} -> ${response.status} ${response.statusText}${text ? ` | ${text}` : ""}`);
  }

  return response.json() as Promise<T>;
}

function stripJsonExtension(name: string) {
  return name.replace(/\.json$/i, "");
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
