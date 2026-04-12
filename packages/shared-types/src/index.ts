export interface BookRecord {
  book_id: string;
  title: string;
  original_filename: string;
  local_path: string;
  file_size: number;
  file_hash: string;
  created_at: number;
  updated_at: number;
}

export interface ProgressRecord {
  book_id: string;
  device_id: string;
  session_id: string;
  page: number;
  position_in_page: number;
  logical_progress: number;
  opened_at: number;
  updated_at: number;
  pending_sync?: boolean;
}

export interface ResolvedProgress {
  source: "local" | "remote-self" | "remote-other";
  record: ProgressRecord | null;
  reason: string;
}

export type BookSourceKind = "file-handle" | "directory-handle" | "imported-blob";

export interface BookAssetRecord {
  book_id: string;
  source_kind: BookSourceKind;
  relative_path: string;
  file_name: string;
  mime_type: string;
  blob?: Blob;
  handle?: FileSystemFileHandle;
}

export interface DeviceSettings {
  device_id: string;
  last_opened_book_id?: string;
}
