import type { BookAssetRecord, BookRecord } from "@minibook/shared-types";
import { sha256Hex } from "@/lib/crypto";

export type ImportedBook = {
  book: BookRecord;
  asset: BookAssetRecord;
};

type FileSourceKind = "file-handle" | "directory-handle" | "imported-blob";

async function buildImportedBook(
  file: File,
  sourceKind: FileSourceKind,
  relativePath: string,
  handle?: FileSystemFileHandle,
): Promise<ImportedBook> {
  const buffer = await file.arrayBuffer();
  const fileHash = await sha256Hex(buffer);
  const now = Date.now();
  const title = file.name.replace(/\.pdf$/i, "");

  return {
    book: {
      book_id: fileHash,
      title,
      original_filename: file.name,
      local_path: relativePath,
      file_size: file.size,
      file_hash: fileHash,
      created_at: now,
      updated_at: now,
    },
    asset: {
      book_id: fileHash,
      source_kind: sourceKind,
      relative_path: relativePath,
      file_name: file.name,
      mime_type: file.type || "application/pdf",
      blob: new Blob([buffer], { type: "application/pdf" }),
      handle,
    },
  };
}

export async function importPdfFiles(fileList: FileList | File[]): Promise<ImportedBook[]> {
  const files = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".pdf"));
  const imported: ImportedBook[] = [];

  for (const file of files) {
    imported.push(await buildImportedBook(file, "imported-blob", `imported:${file.name}`));
  }

  return imported;
}

async function walkDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<ImportedBook[]> {
  const imported: ImportedBook[] = [];
  const values = (directoryHandle as unknown as {
    values: () => AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
  }).values();

  for await (const entry of values) {
    const nextPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.kind === "directory") {
      imported.push(...(await walkDirectory(entry as FileSystemDirectoryHandle, nextPath)));
      continue;
    }

    if (entry.name.toLowerCase().endsWith(".pdf")) {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      imported.push(await buildImportedBook(file, "directory-handle", nextPath, fileHandle));
    }
  }

  return imported;
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function importFromDirectory(): Promise<ImportedBook[]> {
  const directoryHandle = await ((window as unknown) as Window & {
    showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker({ mode: "read" });
  return walkDirectory(directoryHandle);
}

export async function readPdfBytes(asset: BookAssetRecord): Promise<ArrayBuffer> {
  if (asset.handle) {
    try {
      const file = await asset.handle.getFile();
      return file.arrayBuffer();
    } catch {
      // Some browsers revoke later reads from persisted file handles.
      // Fall back to the locally stored blob if we have one.
    }
  }

  if (asset.blob) {
    return asset.blob.arrayBuffer();
  }

  throw new Error("This local file is no longer readable. Re-import the PDF or choose the folder again.");
}
