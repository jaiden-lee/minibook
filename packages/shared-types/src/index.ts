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

export interface RemoteProgressFile {
  fileId: string;
  deviceId: string;
  modifiedTime?: string;
  record: ProgressRecord | null;
}

export interface RemoteProgressInsight {
  device_count: number;
  other_device_count: number;
  latest_remote_updated_at: number | null;
  latest_remote_device_id: string | null;
  latest_remote_record: ProgressRecord | null;
  latest_other_device_record: ProgressRecord | null;
  newest_source: "none" | "remote-self" | "remote-other";
  newer_remote_other_available: boolean;
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
