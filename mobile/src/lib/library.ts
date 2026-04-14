import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import type { BookRecord, ProgressRecord } from "@minibook/shared-types";
import { computeLogicalProgress } from "@minibook/sync-core";
import { getBook, getProgress, getSetting, setSetting, upsertBook, upsertProgress } from "./database";
import { getOrCreateDeviceId } from "./device";
import { hashFileSha256 } from "./hash";

const LIBRARY_DIRECTORY = `${FileSystem.documentDirectory}library`;
const LIBRARY_DIRECTORY_URI_KEY = "library_directory_uri";

export async function ensureLibraryDirectory() {
  const info = await FileSystem.getInfoAsync(LIBRARY_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LIBRARY_DIRECTORY, { intermediates: true });
  }
}

export async function importPdfFromDevice() {
  await ensureLibraryDirectory();

  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];
  const fileHash = await hashFileSha256(asset.uri);
  const fileName = asset.name ?? `${fileHash}.pdf`;
  const destinationUri = `${LIBRARY_DIRECTORY}/${fileHash}.pdf`;
  const now = Date.now();
  const destinationInfo = await FileSystem.getInfoAsync(destinationUri);

  if (destinationInfo.exists) {
    await FileSystem.deleteAsync(destinationUri, { idempotent: true });
  }

  await FileSystem.copyAsync({
    from: asset.uri,
    to: destinationUri,
  });

  const existing = await getBook(fileHash);
  const book: BookRecord = {
    book_id: fileHash,
    title: stripPdfExtension(fileName),
    original_filename: fileName,
    local_path: destinationUri,
    file_size: asset.size ?? 0,
    file_hash: fileHash,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await upsertBook(book);
  return book;
}

export async function chooseAndroidLibraryDirectory() {
  if (Platform.OS !== "android") {
    return null;
  }

  const existing = await getSetting(LIBRARY_DIRECTORY_URI_KEY);
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(existing);
  if (!result.granted || !result.directoryUri) {
    return null;
  }

  await setSetting(LIBRARY_DIRECTORY_URI_KEY, result.directoryUri);
  await indexAndroidLibraryDirectory(result.directoryUri);
  return result.directoryUri;
}

export async function getAndroidLibraryDirectoryUri() {
  if (Platform.OS !== "android") {
    return null;
  }

  return getSetting(LIBRARY_DIRECTORY_URI_KEY);
}

export async function indexAndroidLibraryDirectory(directoryUri?: string | null) {
  if (Platform.OS !== "android") {
    return [];
  }

  const baseUri = directoryUri ?? await getAndroidLibraryDirectoryUri();
  if (!baseUri) {
    return [];
  }

  const fileUris = await FileSystem.StorageAccessFramework.readDirectoryAsync(baseUri);
  const pdfUris = fileUris.filter((uri) => uri.toLowerCase().includes(".pdf"));
  const imported: BookRecord[] = [];

  for (const fileUri of pdfUris) {
    const fileHash = await hashFileSha256(fileUri);
    const name = extractDisplayNameFromUri(fileUri, fileHash);
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    const existing = await getBook(fileHash);
    const now = Date.now();

    const book: BookRecord = {
      book_id: fileHash,
      title: stripPdfExtension(name),
      original_filename: name,
      local_path: fileUri,
      file_size: "size" in fileInfo && typeof fileInfo.size === "number" ? fileInfo.size : 0,
      file_hash: fileHash,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    await upsertBook(book);
    imported.push(book);
  }

  return imported;
}

export async function openLocalBook(bookId: string) {
  const [book, progress] = await Promise.all([getBook(bookId), getProgress(bookId)]);
  if (!book) {
    throw new Error("This PDF is no longer available on the device.");
  }

  return {
    book,
    progress,
    fileUri: book.local_path,
  };
}

export async function saveBookProgress(
  bookId: string,
  page: number,
  totalPages: number,
  positionInPage: number,
  previous?: ProgressRecord | null,
) {
  const now = Date.now();
  const progress: ProgressRecord = {
    book_id: bookId,
    device_id: previous?.device_id ?? await getOrCreateDeviceId(),
    session_id: previous?.session_id ?? createSessionId(),
    page,
    position_in_page: positionInPage,
    logical_progress: computeLogicalProgress(page, totalPages),
    opened_at: previous?.opened_at ?? now,
    updated_at: now,
    pending_sync: true,
  };

  await upsertProgress(progress);
  return progress;
}

function createSessionId() {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function stripPdfExtension(name: string) {
  return name.replace(/\.pdf$/i, "");
}

function extractDisplayNameFromUri(uri: string, fallbackHash: string) {
  const decoded = decodeURIComponent(uri);
  const parts = decoded.split("/");
  const rawName = parts[parts.length - 1] ?? `${fallbackHash}.pdf`;

  if (rawName.includes(":") && !rawName.toLowerCase().endsWith(".pdf")) {
    const afterColon = rawName.split(":").pop();
    if (afterColon) {
      return afterColon;
    }
  }

  return rawName;
}
