import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import fsSync from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "web", "dist");
const tokenStorePath = path.join(rootDir, ".local-auth", "google-oauth.json");

const app = express();
const port = Number(process.env.PORT ?? 3000);
const googleConfig = readGoogleConfig();

app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: "text/plain", limit: "1mb" }));

app.get("/api/auth/status", async (_request, response) => {
  if (!googleConfig.configured) {
    response.json({
      configured: false,
      authenticated: false,
      profile: null,
    });
    return;
  }

  const session = await readTokenStore();
  response.json({
    configured: true,
    authenticated: !!session?.refreshToken,
    profile: session?.profile ?? null,
  });
});

app.get("/api/auth/start", async (request, response) => {
  if (!googleConfig.configured) {
    response.status(500).send("Google OAuth is not configured.");
    return;
  }

  const state = encodeState({
    returnTo: getSafeReturnTo(request.query.returnTo),
  });

  const params = new URLSearchParams({
    client_id: googleConfig.clientId,
    redirect_uri: googleConfig.redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "openid",
      "email",
      "profile",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/api/auth/callback", async (request, response) => {
  if (!googleConfig.configured) {
    response.status(500).send("Google OAuth is not configured.");
    return;
  }

  const code = typeof request.query.code === "string" ? request.query.code : null;
  const encodedState = typeof request.query.state === "string" ? request.query.state : null;
  const decodedState = decodeState(encodedState);

  if (!code) {
    response.status(400).send("Missing OAuth code.");
    return;
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    const existing = await readTokenStore();
    const profile = await fetchGoogleProfile(tokens.access_token);

    await writeTokenStore({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? null,
      expiresAt: Date.now() + Math.max(1, tokens.expires_in ?? 3600) * 1000,
      scope: tokens.scope ?? null,
      profile,
    });

    response.redirect(decodedState.returnTo);
  } catch (caught) {
    response.status(500).send(caught instanceof Error ? caught.message : "Google OAuth callback failed.");
  }
});

app.post("/api/auth/logout", async (_request, response) => {
  await clearTokenStore();
  response.status(204).end();
});

app.post("/api/drive/sync-book", async (request, response) => {
  if (!googleConfig.configured) {
    response.status(500).json({ error: "Google OAuth is not configured." });
    return;
  }

  const body = parseSyncRequestBody(request.body);
  const bookId = typeof body?.bookId === "string" ? body.bookId : null;
  const progress = normalizeProgressRecord(body?.progress);

  if (!bookId || !progress) {
    response.status(400).json({ error: "Missing bookId or progress payload." });
    return;
  }

  try {
    const accessToken = await getValidAccessToken();
    await upsertBookProgressFile(accessToken, bookId, progress.device_id, progress);
    const remoteFiles = await listBookProgressFiles(accessToken, bookId);
    response.json({
      synced: true,
      remoteFileCount: remoteFiles.length,
      progress,
    });
  } catch (caught) {
    response.status(500).json({ error: caught instanceof Error ? caught.message : "Drive sync failed." });
  }
});

app.get("/api/drive/book-progress/:bookId", async (request, response) => {
  if (!googleConfig.configured) {
    response.status(500).json({ error: "Google OAuth is not configured." });
    return;
  }

  try {
    const accessToken = await getValidAccessToken();
    const files = await listBookProgressFiles(accessToken, request.params.bookId);
    response.json({
      files,
    });
  } catch (caught) {
    response.status(500).json({ error: caught instanceof Error ? caught.message : "Unable to load Drive progress." });
  }
});

if (fsSync.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`minibook server listening on http://localhost:${port}`);
});

function readGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/auth/callback";

  return {
    configured: !!clientId && !!clientSecret && !!redirectUri,
    clientId,
    clientSecret,
    redirectUri,
  };
}

function getSafeReturnTo(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "http://localhost:5173/settings";
  }

  if (value.startsWith("http://localhost:5173/") || value === "http://localhost:5173") {
    return value;
  }

  if (value.startsWith("http://localhost:3000/") || value === "http://localhost:3000") {
    return value;
  }

  return "http://localhost:5173/settings";
}

function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeState(encodedState) {
  if (!encodedState) {
    return { returnTo: "http://localhost:5173/settings" };
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedState, "base64url").toString("utf8"));
    return {
      returnTo: getSafeReturnTo(parsed?.returnTo),
    };
  } catch {
    return { returnTo: "http://localhost:5173/settings" };
  }
}

async function exchangeAuthorizationCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: googleConfig.clientId,
    client_secret: googleConfig.clientSecret,
    redirect_uri: googleConfig.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return parseGoogleResponse(response);
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: googleConfig.clientId,
    client_secret: googleConfig.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return parseGoogleResponse(response);
}

async function fetchGoogleProfile(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseGoogleResponse(response);
}

async function parseGoogleResponse(response) {
  if (response.ok) {
    return response.json();
  }

  let message = `Google request failed (${response.status}).`;
  try {
    const result = await response.json();
    message = result.error_description ?? result.error?.message ?? result.error ?? message;
  } catch {
    // ignore
  }

  throw new Error(message);
}

async function getValidAccessToken() {
  const session = await readTokenStore();
  if (!session?.refreshToken) {
    throw new Error("Not signed in with Google Drive.");
  }

  if (session.accessToken && session.expiresAt - Date.now() > 60_000) {
    return session.accessToken;
  }

  const refreshed = await refreshAccessToken(session.refreshToken);
  const nextSession = {
    ...session,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + Math.max(1, refreshed.expires_in ?? 3600) * 1000,
    scope: refreshed.scope ?? session.scope ?? null,
  };

  await writeTokenStore(nextSession);
  return nextSession.accessToken;
}

async function readTokenStore() {
  try {
    const raw = await fs.readFile(tokenStorePath, "utf8");
    const parsed = JSON.parse(raw);

    if (typeof parsed?.refreshToken === "string") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

async function writeTokenStore(session) {
  await fs.mkdir(path.dirname(tokenStorePath), { recursive: true });
  await fs.writeFile(tokenStorePath, JSON.stringify(session, null, 2), "utf8");
}

async function clearTokenStore() {
  try {
    await fs.unlink(tokenStorePath);
  } catch {
    // ignore
  }
}

function normalizeProgressRecord(value) {
  if (
    typeof value?.book_id === "string" &&
    typeof value?.device_id === "string" &&
    typeof value?.session_id === "string" &&
    typeof value?.page === "number" &&
    typeof value?.position_in_page === "number" &&
    typeof value?.logical_progress === "number" &&
    typeof value?.opened_at === "number" &&
    typeof value?.updated_at === "number"
  ) {
    return {
      book_id: value.book_id,
      device_id: value.device_id,
      session_id: value.session_id,
      page: value.page,
      position_in_page: value.position_in_page,
      logical_progress: value.logical_progress,
      opened_at: value.opened_at,
      updated_at: value.updated_at,
    };
  }

  return null;
}

function parseSyncRequestBody(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  return body;
}

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const APP_FOLDER_NAME = "minibook";
const PROGRESS_FOLDER_NAME = "progress";

async function ensureDriveProgressRoot(accessToken) {
  const appFolderId = await ensureFolder(accessToken, APP_FOLDER_NAME);
  const progressFolderId = await ensureFolder(accessToken, PROGRESS_FOLDER_NAME, { parentId: appFolderId });

  return { appFolderId, progressFolderId };
}

async function listBookProgressFiles(accessToken, bookId) {
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

  return Promise.all(
    files
      .filter((file) => file.name.endsWith(".json"))
      .map(async (file) => {
        const raw = await fetchFileText(accessToken, file.id);
        return {
          fileId: file.id,
          deviceId: file.name.replace(/\.json$/i, ""),
          modifiedTime: file.modifiedTime,
          record: tryParseJson(raw),
        };
      }),
  );
}

async function upsertBookProgressFile(accessToken, bookId, deviceId, progress) {
  const { progressFolderId } = await ensureDriveProgressRoot(accessToken);
  const bookFolderId = await ensureFolder(accessToken, bookId, { parentId: progressFolderId });
  const fileName = `${deviceId}.json`;
  const existing = await findFile(accessToken, fileName, { parentId: bookFolderId });
  const payload = JSON.stringify(progress, null, 2);

  if (existing) {
    await updateJsonFile(accessToken, existing.id, payload);
    return existing.id;
  }

  return createJsonFile(accessToken, fileName, bookFolderId, payload);
}

async function ensureFolder(accessToken, name, options = {}) {
  const existing = await findFolder(accessToken, name, options);
  if (existing) {
    return existing.id;
  }

  const response = await fetch(`${DRIVE_API_BASE}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME_TYPE,
      parents: options.parentId ? [options.parentId] : undefined,
    }),
  });

  return (await parseGoogleResponse(response)).id;
}

async function findFolder(accessToken, name, options = {}) {
  return findFile(accessToken, name, {
    parentId: options.parentId,
    mimeType: FOLDER_MIME_TYPE,
  });
}

async function findFile(accessToken, name, options = {}) {
  const filters = [`name = ${quoteDriveValue(name)}`, "trashed = false"];
  if (options.parentId) {
    filters.push(`'${options.parentId}' in parents`);
  }
  if (options.mimeType) {
    filters.push(`mimeType = '${options.mimeType}'`);
  }

  const files = await listFiles(accessToken, filters);
  return files[0] ?? null;
}

async function listFiles(accessToken, filters) {
  const search = new URLSearchParams({
    q: filters.join(" and "),
    fields: "files(id,name,mimeType,modifiedTime)",
    pageSize: "100",
  });

  const response = await fetch(`${DRIVE_API_BASE}/files?${search.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const result = await parseGoogleResponse(response);
  return result.files ?? [];
}

async function createJsonFile(accessToken, fileName, parentId, payload) {
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  return (await parseGoogleResponse(response)).id;
}

async function updateJsonFile(accessToken, fileId, payload) {
  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: payload,
  });

  await parseGoogleResponse(response);
}

async function fetchFileText(accessToken, fileId) {
  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Drive file download failed (${response.status}).`);
  }

  return response.text();
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function quoteDriveValue(value) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
