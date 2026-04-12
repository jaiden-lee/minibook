import type { BookAssetRecord, BookRecord, ProgressRecord } from "@minibook/shared-types";

const DB_NAME = "minibook-web";
const DB_VERSION = 1;

type SettingRecord = {
  key: string;
  value: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "book_id" });
      }

      if (!db.objectStoreNames.contains("assets")) {
        db.createObjectStore("assets", { keyPath: "book_id" });
      }

      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "book_id" });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: "books" | "assets" | "progress" | "settings",
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    fn(store)
      .then((value) => resolve(value))
      .catch((error) => reject(error));

    transaction.onerror = () => reject(transaction.error);
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listBooks(): Promise<BookRecord[]> {
  return withStore("books", "readonly", async (store) => {
    const result = (await promisifyRequest(store.getAll())) as BookRecord[];
    return result.sort((a, b) => b.updated_at - a.updated_at);
  });
}

export async function getBook(bookId: string): Promise<BookRecord | undefined> {
  return withStore("books", "readonly", async (store) => {
    const book = (await promisifyRequest(store.get(bookId))) as BookRecord | undefined;
    return book;
  });
}

export async function upsertBook(book: BookRecord): Promise<void> {
  await withStore("books", "readwrite", async (store) => {
    await promisifyRequest(store.put(book));
  });
}

export async function getBookAsset(bookId: string): Promise<BookAssetRecord | undefined> {
  return withStore("assets", "readonly", async (store) => {
    const asset = (await promisifyRequest(store.get(bookId))) as BookAssetRecord | undefined;
    return asset;
  });
}

export async function upsertBookAsset(asset: BookAssetRecord): Promise<void> {
  await withStore("assets", "readwrite", async (store) => {
    await promisifyRequest(store.put(asset));
  });
}

export async function getProgress(bookId: string): Promise<ProgressRecord | undefined> {
  return withStore("progress", "readonly", async (store) => {
    const progress = (await promisifyRequest(store.get(bookId))) as ProgressRecord | undefined;
    return progress;
  });
}

export async function listProgress(): Promise<ProgressRecord[]> {
  return withStore("progress", "readonly", async (store) => {
    const result = (await promisifyRequest(store.getAll())) as ProgressRecord[];
    return result;
  });
}

export async function upsertProgress(progress: ProgressRecord): Promise<void> {
  await withStore("progress", "readwrite", async (store) => {
    await promisifyRequest(store.put(progress));
  });
}

export async function getSetting(key: string): Promise<string | undefined> {
  return withStore("settings", "readonly", async (store) => {
    const setting = (await promisifyRequest(store.get(key))) as SettingRecord | undefined;
    return setting?.value;
  });
}

export async function setSetting(key: string, value: string): Promise<void> {
  await withStore("settings", "readwrite", async (store) => {
    await promisifyRequest(store.put({ key, value }));
  });
}
