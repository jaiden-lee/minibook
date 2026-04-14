import * as SQLite from "expo-sqlite";
import type { BookRecord, ProgressRecord } from "@minibook/shared-types";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export type MobileBookRow = {
  book_id: string;
  title: string;
  original_filename: string;
  local_path: string;
  file_size: number;
  file_hash: string;
  created_at: number;
  updated_at: number;
};

export async function ensureDatabase() {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS books (
      book_id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      local_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress (
      book_id TEXT PRIMARY KEY NOT NULL,
      device_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      page INTEGER NOT NULL,
      position_in_page REAL NOT NULL,
      logical_progress REAL NOT NULL,
      opened_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      pending_sync INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
  `);
}

export async function listLibraryBooks() {
  const db = await getDatabase();
  const books = await db.getAllAsync<MobileBookRow>("SELECT * FROM books ORDER BY updated_at DESC");
  const progress = await db.getAllAsync<ProgressRecord>("SELECT * FROM progress");
  const progressMap = new Map(progress.map((entry) => [entry.book_id, normalizeProgress(entry)]));

  return books.map((book) => ({
    book,
    progress: progressMap.get(book.book_id),
  }));
}

export async function getBook(bookId: string) {
  const db = await getDatabase();
  return db.getFirstAsync<BookRecord>("SELECT * FROM books WHERE book_id = ?", [bookId]);
}

export async function getProgress(bookId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProgressRecord>("SELECT * FROM progress WHERE book_id = ?", [bookId]);
  return row ? normalizeProgress(row) : null;
}

export async function upsertBook(book: BookRecord) {
  const db = await getDatabase();
  await db.runAsync(
    `
      INSERT INTO books (book_id, title, original_filename, local_path, file_size, file_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id) DO UPDATE SET
        title = excluded.title,
        original_filename = excluded.original_filename,
        local_path = excluded.local_path,
        file_size = excluded.file_size,
        file_hash = excluded.file_hash,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `,
    [
      book.book_id,
      book.title,
      book.original_filename,
      book.local_path,
      book.file_size,
      book.file_hash,
      book.created_at,
      book.updated_at,
    ],
  );
}

export async function upsertProgress(progress: ProgressRecord) {
  const db = await getDatabase();
  await db.runAsync(
    `
      INSERT INTO progress (
        book_id, device_id, session_id, page, position_in_page, logical_progress, opened_at, updated_at, pending_sync
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id) DO UPDATE SET
        device_id = excluded.device_id,
        session_id = excluded.session_id,
        page = excluded.page,
        position_in_page = excluded.position_in_page,
        logical_progress = excluded.logical_progress,
        opened_at = excluded.opened_at,
        updated_at = excluded.updated_at,
        pending_sync = excluded.pending_sync
    `,
    [
      progress.book_id,
      progress.device_id,
      progress.session_id,
      progress.page,
      progress.position_in_page,
      progress.logical_progress,
      progress.opened_at,
      progress.updated_at,
      progress.pending_sync ? 1 : 0,
    ],
  );
}

export async function getSetting(key: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const db = await getDatabase();
  await db.runAsync(
    `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    [key, value],
  );
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("minibook.db");
  }

  return databasePromise;
}

function normalizeProgress(progress: ProgressRecord): ProgressRecord {
  return {
    ...progress,
    pending_sync: Boolean(progress.pending_sync),
  };
}
