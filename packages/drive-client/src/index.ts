import type { ProgressRecord } from "@minibook/shared-types";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const APP_FOLDER_NAME = "minibook";
const PROGRESS_FOLDER_NAME = "progress";

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
};

type DriveProgressFile = {
  fileId: string;
  deviceId: string;
  modifiedTime?: string;
  record: ProgressRecord | null;
};

type EnsureFolderOptions = {
  parentId?: string;
};

export async function ensureDriveProgressRoot(accessToken: string) {
  const appFolderId = await ensureFolder(accessToken, APP_FOLDER_NAME);
  const progressFolderId = await ensureFolder(accessToken, PROGRESS_FOLDER_NAME, { parentId: appFolderId });

  return {
    appFolderId,
    progressFolderId,
  };
}

export async function listBookProgressFiles(accessToken: string, bookId: string): Promise<DriveProgressFile[]> {
  const { progressFolderId } = await ensureDriveProgressRoot(accessToken);
  const bookFolder = await findFolder(accessToken, bookId, { parentId: progressFolderId });

  if (!bookFolder) {
    return [];
  }

  const files = await listFiles(accessToken, [
    `'${bookFolder.id}' in parents`,
    "trashed = false",
    "mimeType != 'application/vnd.google-apps.folder'",
  ]);

  const progressFiles = await Promise.all(
    files
      .filter((file) => file.name.endsWith(".json"))
      .map(async (file) => {
        const raw = await fetchFileText(accessToken, file.id);
        return {
          fileId: file.id,
          deviceId: file.name.replace(/\.json$/i, ""),
          modifiedTime: file.modifiedTime,
          record: parseProgressRecord(raw),
        } satisfies DriveProgressFile;
      }),
  );

  return progressFiles;
}

export async function upsertBookProgressFile(
  accessToken: string,
  bookId: string,
  deviceId: string,
  progress: ProgressRecord,
) {
  const { progressFolderId } = await ensureDriveProgressRoot(accessToken);
  const bookFolderId = await ensureFolder(accessToken, bookId, { parentId: progressFolderId });
  const fileName = `${deviceId}.json`;
  const existing = await findFile(accessToken, fileName, { parentId: bookFolderId });
  const payload = JSON.stringify(stripLocalOnlyFields(progress), null, 2);

  if (existing) {
    await updateJsonFile(accessToken, existing.id, payload);
    return existing.id;
  }

  return createJsonFile(accessToken, fileName, bookFolderId, payload);
}

async function ensureFolder(accessToken: string, name: string, options?: EnsureFolderOptions) {
  const existing = await findFolder(accessToken, name, options);
  if (existing) {
    return existing.id;
  }

  const body = {
    name,
    mimeType: FOLDER_MIME_TYPE,
    parents: options?.parentId ? [options.parentId] : undefined,
  };

  const response = await fetch(`${DRIVE_API_BASE}/files`, {
    method: "POST",
    headers: buildDriveHeaders(accessToken, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });

  const created = await parseDriveResponse<DriveFile>(response);
  return created.id;
}

async function findFolder(accessToken: string, name: string, options?: EnsureFolderOptions) {
  return findFile(accessToken, name, {
    parentId: options?.parentId,
    mimeType: FOLDER_MIME_TYPE,
  });
}

async function findFile(
  accessToken: string,
  name: string,
  options?: { parentId?: string; mimeType?: string },
): Promise<DriveFile | null> {
  const filters = [`name = ${quoteDriveValue(name)}`, "trashed = false"];

  if (options?.parentId) {
    filters.push(`'${options.parentId}' in parents`);
  }

  if (options?.mimeType) {
    filters.push(`mimeType = '${options.mimeType}'`);
  }

  const files = await listFiles(accessToken, filters);
  return files[0] ?? null;
}

async function listFiles(accessToken: string, filters: string[]): Promise<DriveFile[]> {
  const search = new URLSearchParams({
    q: filters.join(" and "),
    fields: "files(id,name,mimeType,modifiedTime)",
    pageSize: "100",
    supportsAllDrives: "false",
  });

  const response = await fetch(`${DRIVE_API_BASE}/files?${search.toString()}`, {
    headers: buildDriveHeaders(accessToken),
  });

  const result = await parseDriveResponse<{ files?: DriveFile[] }>(response);
  return result.files ?? [];
}

async function createJsonFile(accessToken: string, fileName: string, parentId: string, payload: string) {
  const boundary = `minibook-boundary-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [parentId],
    mimeType: "application/json",
  });
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    payload,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
    method: "POST",
    headers: buildDriveHeaders(accessToken, {
      "Content-Type": `multipart/related; boundary=${boundary}`,
    }),
    body,
  });

  const created = await parseDriveResponse<DriveFile>(response);
  return created.id;
}

async function updateJsonFile(accessToken: string, fileId: string, payload: string) {
  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: buildDriveHeaders(accessToken, {
      "Content-Type": "application/json; charset=UTF-8",
    }),
    body: payload,
  });

  await parseDriveResponse(response);
}

async function fetchFileText(accessToken: string, fileId: string) {
  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: buildDriveHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`Drive file download failed (${response.status}).`);
  }

  return response.text();
}

function buildDriveHeaders(accessToken: string, extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  };
}

async function parseDriveResponse<T = unknown>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  let message = `Drive request failed (${response.status}).`;

  try {
    const error = (await response.json()) as { error?: { message?: string } };
    if (error.error?.message) {
      message = error.error.message;
    }
  } catch {
    // ignore JSON parse errors for error bodies
  }

  throw new Error(message);
}

function parseProgressRecord(raw: string): ProgressRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ProgressRecord>;
    if (
      typeof parsed.book_id === "string" &&
      typeof parsed.device_id === "string" &&
      typeof parsed.session_id === "string" &&
      typeof parsed.page === "number" &&
      typeof parsed.position_in_page === "number" &&
      typeof parsed.logical_progress === "number" &&
      typeof parsed.opened_at === "number" &&
      typeof parsed.updated_at === "number"
    ) {
      return parsed as ProgressRecord;
    }
  } catch {
    return null;
  }

  return null;
}

function stripLocalOnlyFields(progress: ProgressRecord): ProgressRecord {
  const { pending_sync: _pendingSync, ...remote } = progress;
  return remote;
}

function quoteDriveValue(value: string) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export type { DriveProgressFile };
