import type { BookRecord, ProgressRecord } from "@minibook/shared-types";
import { computeLogicalProgress } from "@minibook/sync-core";
import {
  getBook,
  getBookAsset,
  getProgress,
  listBooks,
  listProgress,
  setSetting,
  upsertBook,
  upsertBookAsset,
  upsertProgress,
} from "@/lib/db";
import { importFromDirectory, importPdfFiles, readPdfBytes, supportsDirectoryPicker } from "@/lib/files";
import { createSessionId, getOrCreateDeviceId } from "@/lib/id";

export type LibraryBook = {
  book: BookRecord;
  progress?: ProgressRecord;
};

export async function loadLibrary(): Promise<LibraryBook[]> {
  const [books, progressList] = await Promise.all([listBooks(), listProgress()]);
  const progressMap = new Map(progressList.map((progress) => [progress.book_id, progress]));

  return books.map((book) => ({
    book,
    progress: progressMap.get(book.book_id),
  }));
}

export async function importBooksFromFiles(fileList: FileList | File[]): Promise<void> {
  const imported = await importPdfFiles(fileList);

  for (const item of imported) {
    const existing = await getBook(item.book.book_id);
    await upsertBook({
      ...item.book,
      created_at: existing?.created_at ?? item.book.created_at,
      updated_at: Date.now(),
    });
    await upsertBookAsset(item.asset);
  }
}

export async function importBooksFromChosenDirectory(): Promise<void> {
  const imported = await importFromDirectory();

  for (const item of imported) {
    const existing = await getBook(item.book.book_id);
    await upsertBook({
      ...item.book,
      created_at: existing?.created_at ?? item.book.created_at,
      updated_at: Date.now(),
    });
    await upsertBookAsset(item.asset);
  }
}

export function canChooseDirectory(): boolean {
  return supportsDirectoryPicker();
}

export async function openLocalBook(bookId: string) {
  const [book, asset, progress] = await Promise.all([getBook(bookId), getBookAsset(bookId), getProgress(bookId)]);

  if (!book || !asset) {
    throw new Error("This book is no longer available in local storage.");
  }

  await setSetting("last_opened_book_id", bookId);

  return {
    book,
    progress,
    bytes: await readPdfBytes(asset),
  };
}

export async function saveBookProgress(
  bookId: string,
  page: number,
  totalPages: number,
  positionInPage: number,
  previous?: ProgressRecord,
): Promise<ProgressRecord> {
  const deviceId = getOrCreateDeviceId();
  const now = Date.now();
  const logicalProgress = computeLogicalProgress(page, totalPages);

  const progress: ProgressRecord = {
    book_id: bookId,
    device_id: deviceId,
    session_id: previous?.session_id ?? createSessionId(),
    page,
    position_in_page: positionInPage,
    logical_progress: logicalProgress,
    opened_at: previous?.opened_at ?? now,
    updated_at: now,
    pending_sync: true,
  };

  await upsertProgress(progress);
  return progress;
}
