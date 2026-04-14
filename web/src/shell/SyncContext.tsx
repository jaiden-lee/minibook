import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProgressRecord } from "@minibook/shared-types";
import { listProgress } from "@/lib/db";
import { replaceLocalProgress } from "@/lib/library";
import { syncBookProgressToDrive } from "@/lib/driveSync";
import { useAuth } from "@/shell/AuthContext";

type BookSyncState = "synced" | "pending" | "offline" | "error" | "signed-out" | "idle";

type SyncBookResult = {
  progress: ProgressRecord;
  remoteFileCount: number;
};

type SyncContextValue = {
  pendingCount: number;
  failedCount: number;
  isSyncingAll: boolean;
  lastSyncedAt: number | null;
  getBookSyncState: (bookId: string, progress?: ProgressRecord) => BookSyncState;
  getBookSyncMessage: (bookId: string, progress?: ProgressRecord) => string | null;
  syncBook: (bookId: string, progress: ProgressRecord) => Promise<SyncBookResult>;
  syncAllPending: () => Promise<void>;
  refreshSyncState: () => Promise<void>;
  markBookPending: (bookId: string) => void;
  markBookError: (bookId: string, message: string) => void;
  markBookSynced: (bookId: string) => void;
};

type SyncSnapshot = {
  pendingCount: number;
  statuses: Record<string, BookSyncState>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [snapshot, setSnapshot] = useState<SyncSnapshot>({ pendingCount: 0, statuses: {} });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const refreshSyncState = useCallback(async () => {
    const allProgress = await listProgress();
    const statuses: Record<string, BookSyncState> = {};

    for (const progress of allProgress) {
      if (errors[progress.book_id]) {
        statuses[progress.book_id] = "error";
        continue;
      }

      if (progress.pending_sync) {
        statuses[progress.book_id] = !auth.isAuthenticated
          ? "signed-out"
          : navigator.onLine
            ? "pending"
            : "offline";
      } else {
        statuses[progress.book_id] = "synced";
      }
    }

    setSnapshot({
      pendingCount: allProgress.filter((entry) => entry.pending_sync).length,
      statuses,
    });
  }, [auth.isAuthenticated, errors]);

  useEffect(() => {
    void refreshSyncState();
  }, [refreshSyncState]);

  const syncBookInternal = useCallback(async (bookId: string, progress: ProgressRecord) => {
    if (!auth.isAuthenticated) {
      const message = "Sign in to sync. Progress is still saved locally.";
      setErrors((current) => ({ ...current, [bookId]: message }));
      throw new Error(message);
    }

    if (!navigator.onLine) {
      const message = "Offline. Progress will sync later.";
      setSnapshot((current) => ({
        ...current,
        statuses: {
          ...current.statuses,
          [bookId]: "offline",
        },
      }));
      throw new Error(message);
    }

    try {
      setSnapshot((current) => ({
        ...current,
        statuses: {
          ...current.statuses,
          [bookId]: "pending",
        },
      }));

      const result = await syncBookProgressToDrive(bookId, progress);
      await replaceLocalProgress(result.progress, false);
      setErrors((current) => {
        const next = { ...current };
        delete next[bookId];
        return next;
      });
      setLastSyncedAt(Date.now());
      await refreshSyncState();
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Drive sync failed.";
      setErrors((current) => ({ ...current, [bookId]: message }));
      setSnapshot((current) => ({
        ...current,
        statuses: {
          ...current.statuses,
          [bookId]: navigator.onLine ? "error" : "offline",
        },
      }));
      throw new Error(message);
    }
  }, [auth.isAuthenticated, refreshSyncState]);

  const syncAllPendingInternal = useCallback(async () => {
    if (isSyncingAll) {
      return;
    }

    setIsSyncingAll(true);
    try {
      const allProgress = await listProgress();
      const pending = allProgress.filter((entry) => entry.pending_sync);
      for (const progress of pending) {
        try {
          await syncBookInternal(progress.book_id, progress);
        } catch {
          // keep trying other books
        }
      }
    } finally {
      setIsSyncingAll(false);
      await refreshSyncState();
    }
  }, [isSyncingAll, refreshSyncState, syncBookInternal]);

  const getBookSyncState = useCallback((bookId: string, progress?: ProgressRecord): BookSyncState => {
    const explicit = snapshot.statuses[bookId];
    if (explicit) {
      return explicit;
    }

    if (errors[bookId]) {
      return "error";
    }

    if (!auth.isAuthenticated) {
      return progress?.pending_sync ? "signed-out" : "idle";
    }

    if (!navigator.onLine && progress?.pending_sync) {
      return "offline";
    }

    if (progress?.pending_sync) {
      return "pending";
    }

    return progress ? "synced" : "idle";
  }, [auth.isAuthenticated, errors, snapshot.statuses]);

  const getBookSyncMessage = useCallback((bookId: string, progress?: ProgressRecord) => {
    const state = getBookSyncState(bookId, progress);
    if (state === "error") {
      return errors[bookId] ?? "Sync failed";
    }
    if (state === "offline") {
      return "Offline";
    }
    if (state === "signed-out") {
      return "Sign in to sync";
    }
    if (state === "pending") {
      return "Pending sync";
    }
    if (state === "synced") {
      return "Synced";
    }

    return null;
  }, [errors, getBookSyncState]);

  const value = useMemo<SyncContextValue>(() => ({
    pendingCount: snapshot.pendingCount,
    failedCount: Object.keys(errors).length,
    isSyncingAll,
    lastSyncedAt,
    getBookSyncState,
    getBookSyncMessage,
    syncBook: syncBookInternal,
    syncAllPending: syncAllPendingInternal,
    refreshSyncState,
    markBookPending: (bookId) => {
      setSnapshot((current) => ({
        ...current,
        pendingCount: Math.max(current.pendingCount, 1),
        statuses: {
          ...current.statuses,
          [bookId]: auth.isAuthenticated ? (navigator.onLine ? "pending" : "offline") : "signed-out",
        },
      }));
    },
    markBookError: (bookId, message) => {
      setErrors((current) => ({ ...current, [bookId]: message }));
      setSnapshot((current) => ({
        ...current,
        statuses: {
          ...current.statuses,
          [bookId]: navigator.onLine ? "error" : "offline",
        },
      }));
    },
    markBookSynced: (bookId) => {
      setErrors((current) => {
        const next = { ...current };
        delete next[bookId];
        return next;
      });
      setLastSyncedAt(Date.now());
      setSnapshot((current) => ({
        ...current,
        statuses: {
          ...current.statuses,
          [bookId]: "synced",
        },
      }));
    },
  }), [
    auth.isAuthenticated,
    errors,
    getBookSyncMessage,
    getBookSyncState,
    isSyncingAll,
    lastSyncedAt,
    refreshSyncState,
    snapshot,
    syncAllPendingInternal,
    syncBookInternal,
  ]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within SyncProvider.");
  }

  return context;
}
