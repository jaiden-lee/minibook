import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useParams } from "react-router-dom";
import type { ProgressRecord, RemoteProgressInsight } from "@minibook/shared-types";
import { resolveProgressRecord, summarizeRemoteProgress } from "@minibook/sync-core";
import { openLocalBook, replaceLocalProgress, saveBookProgress } from "@/lib/library";
import {
  debugPdfAnnotations,
  getPdfLinkLayerItems,
  getPdfPageAspectRatio,
  getPdfTextLayerItems,
  loadPdfDocument,
  renderPdfPage,
  type PdfDocumentHandle,
  type PdfLinkLayerItem,
  type PdfTextLayerItem,
} from "@/lib/pdf";
import { getReaderRemoteNotice, loadRemoteProgressInsight } from "@/lib/remoteProgress";
import { useAppearance, type AppearanceTheme } from "@/shell/AppearanceContext";
import { useAuth } from "@/shell/AuthContext";
import { useSync } from "@/shell/SyncContext";
import { readRemoteBookProgress, syncBookProgressToDriveKeepalive } from "@/lib/driveSync";
import { getOrCreateDeviceId } from "@/lib/id";

type ReaderMode = "flip" | "scroll";

type ReaderState = {
  title: string;
  totalPages: number;
  currentPage: number;
  progress?: ProgressRecord;
  documentHandle: PdfDocumentHandle;
};

type PendingRestore = {
  page: number;
  position: number;
  scrollY?: number;
};

type LocalScrollResume = {
  mode: ReaderMode;
  zoom: number;
  viewportWidth: number;
  scrollY: number;
};

type RestoreDebugSnapshot = {
  source: "local-scroll" | "computed-anchor";
  targetScrollY: number;
};

const READER_MODE_KEY = "minibook:reader-mode";
const READER_ZOOM_KEY = "minibook:reader-zoom";
const READER_DEBUG_KEY = "minibook:reader-debug";
const DEFAULT_PAGE_ASPECT_RATIO = 1.414;
const VIRTUAL_WINDOW = 2;

export function ReaderPage() {
  const { bookId } = useParams();
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const initialScrollDoneRef = useRef(false);
  const pendingRestoreRef = useRef<PendingRestore | null>(null);
  const trackedScrollProgressRef = useRef<{ page: number; position: number }>({ page: 1, position: 0 });
  const dismissedRemoteNoticeAtRef = useRef<number | null>(null);
  const latestUnmountSnapshotRef = useRef<{
    bookId: string | null;
    state: ReaderState | null;
    readerMode: ReaderMode;
    zoom: number;
    viewportWidth: number;
    isAuthenticated: boolean;
  }>({
    bookId: null,
    state: null,
    readerMode: "flip",
    zoom: 1,
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : 1280,
    isAuthenticated: false,
  });
  const previousLayoutRef = useRef<{ pageRenderWidth: number; documentHandle: PdfDocumentHandle | null }>({
    pageRenderWidth: 0,
    documentHandle: null,
  });
  const [state, setState] = useState<ReaderState | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Checking latest progress...");
  const [error, setError] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => readStoredReaderMode());
  const [zoom, setZoom] = useState<number>(() => readStoredZoom());
  const { theme, setTheme } = useAppearance();
  const [showAppearanceMenu, setShowAppearanceMenu] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [remoteInsight, setRemoteInsight] = useState<RemoteProgressInsight | null>(null);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
  const [pageJumpValue, setPageJumpValue] = useState("1");
  const [pageAspectRatios, setPageAspectRatios] = useState<Record<number, number>>({});
  const [readerDebug, setReaderDebug] = useState(() => localStorage.getItem(READER_DEBUG_KEY) === "1");
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [scrollAnchorVersion, setScrollAnchorVersion] = useState(0);
  const [pageMountVersion, setPageMountVersion] = useState(0);
  const [restoreDebugSnapshot, setRestoreDebugSnapshot] = useState<RestoreDebugSnapshot | null>(null);
  const [, forceDebugTick] = useState(0);
  const auth = useAuth();
  const sync = useSync();

  const pageRenderWidth = getPageRenderWidth(viewportWidth, zoom);

  useEffect(() => {
    latestUnmountSnapshotRef.current = {
      bookId: bookId ?? null,
      state,
      readerMode,
      zoom,
      viewportWidth,
      isAuthenticated: auth.isAuthenticated,
    };
  }, [auth.isAuthenticated, bookId, readerMode, state, viewportWidth, zoom]);

  useEffect(() => {
    localStorage.setItem(READER_MODE_KEY, readerMode);
  }, [readerMode]);

  useEffect(() => {
    localStorage.setItem(READER_ZOOM_KEY, String(zoom));
  }, [zoom]);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) {
      return;
    }

    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(READER_DEBUG_KEY, readerDebug ? "1" : "0");
  }, [readerDebug]);

  useEffect(() => {
    if (!bookId) {
      window.location.assign("/");
      return;
    }

    const currentBookId = bookId;
    let disposed = false;
    forceWindowScroll(0);
    initialScrollDoneRef.current = false;
    pendingRestoreRef.current = null;

    async function load() {
      try {
        setError(null);
        setRemoteInsight(null);
        setRemoteNotice(null);
        setPageAspectRatios({});
        setLoadingMessage("Checking latest progress...");
        const opened = await openLocalBook(currentBookId);
        const remoteProgressPromise = auth.isAuthenticated
          ? readRemoteBookProgress(currentBookId)
          : Promise.resolve(null);
        setLoadingMessage("Preparing your reading view...");
        const documentHandle = await loadPdfDocument(opened.bytes);
        setLoadingMessage("Measuring page layout...");
        const ratios = await loadAllPageAspectRatios(documentHandle, documentHandle.numPages);

        if (disposed) {
          return;
        }

        let effectiveProgress = opened.progress;
        if (auth.isAuthenticated) {
          try {
            const remoteResult = await remoteProgressPromise;
            const remoteRecords = (remoteResult?.files ?? [])
              .map((entry) => entry.record)
              .filter((entry): entry is ProgressRecord => entry !== null);
            const insight = summarizeRemoteProgress(opened.progress ?? null, remoteRecords, getOrCreateDeviceId());
            const resolved = resolveProgressRecord(opened.progress ?? null, remoteRecords, getOrCreateDeviceId());
            setRemoteInsight(insight);
            setRemoteNotice(getReaderRemoteNotice(insight));

            if (resolved.record) {
              effectiveProgress = resolved.record;

              const localMatchesResolved =
                opened.progress &&
                opened.progress.device_id === resolved.record.device_id &&
                opened.progress.updated_at === resolved.record.updated_at &&
                opened.progress.page === resolved.record.page &&
                opened.progress.position_in_page === resolved.record.position_in_page;

              if (!localMatchesResolved) {
                effectiveProgress = await replaceLocalProgress(resolved.record, false);
              }

              setSyncStatus(
                resolved.source === "local"
                  ? "Using saved local progress."
                  : `Using ${resolved.source === "remote-self" ? "this device's" : "another device's"} synced progress.`,
              );
            } else {
              setSyncStatus("No synced progress found. Reading from local storage.");
            }
          } catch (caught) {
            setRemoteInsight(null);
            setRemoteNotice(null);
            setSyncStatus(getSyncFailureMessage(caught));
          }
        } else {
          setRemoteInsight(null);
          setRemoteNotice(null);
          setSyncStatus("Reading locally. Sign in to sync progress.");
        }

        setPageAspectRatios(ratios);
        const initialPage = effectiveProgress?.page ?? 1;
        const initialPosition = effectiveProgress?.position_in_page ?? 0;
        pendingRestoreRef.current = {
          page: initialPage,
          position: initialPosition,
        };

        const localResume = readLocalScrollResume(currentBookId);
        const resolvedMatchesLocal =
          !!opened.progress &&
          !!effectiveProgress &&
          opened.progress.page === effectiveProgress.page &&
          Math.abs(opened.progress.position_in_page - effectiveProgress.position_in_page) <= 0.001;
        if (
          resolvedMatchesLocal &&
          localResume &&
          localResume.mode === "scroll" &&
          Math.abs(localResume.zoom - zoom) < 0.001 &&
          Math.abs(localResume.viewportWidth - window.innerWidth) <= 2
        ) {
          pendingRestoreRef.current = {
            page: initialPage,
            position: initialPosition,
            scrollY: localResume.scrollY,
          };
        }

        trackedScrollProgressRef.current = { page: initialPage, position: initialPosition };
        setScrollAnchorVersion((value) => value + 1);
        setPageJumpValue(String(initialPage));
        setState({
          title: opened.book.title,
          totalPages: documentHandle.numPages,
          currentPage: initialPage,
          progress: effectiveProgress,
          documentHandle,
        });

      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to open this book.");
      }
    }

    void load();

    return () => {
      disposed = true;
    };
  }, [auth.isAuthenticated, bookId]);

  useEffect(() => {
    if (!state) {
      return;
    }

    setPageJumpValue(String(state.currentPage));
  }, [state?.currentPage]);

  useEffect(() => {
    if (readerMode === "scroll" && state) {
      initialScrollDoneRef.current = false;
      pendingRestoreRef.current = pendingRestoreRef.current ?? {
        page: state.currentPage,
        position: state.progress?.position_in_page ?? trackedScrollProgressRef.current.position,
      };
    }
  }, [readerMode, state?.documentHandle]);

  useEffect(() => {
    if (!state || readerMode !== "scroll") {
      return;
    }

    let frame = 0;

    const updateCurrentPageFromViewport = () => {
      if (!initialScrollDoneRef.current) {
        return;
      }

      const anchorY = getReaderAnchorY();
      let closestPage = state.currentPage;
      let closestPosition = trackedScrollProgressRef.current.position;

      for (const [pageNumber, element] of pageRefs.current.entries()) {
        const rect = getPageMeasurementRect(element);
        if (rect.bottom >= anchorY) {
          closestPage = pageNumber;
          closestPosition = clamp((anchorY - rect.top) / rect.height, 0, 1);
          break;
        }
      }

      trackedScrollProgressRef.current = {
        page: closestPage,
        position: closestPosition,
      };
      setScrollAnchorVersion((value) => value + 1);

      setState((current) => {
        if (!current || current.currentPage === closestPage) {
          return current;
        }

        return {
          ...current,
          currentPage: closestPage,
        };
      });
    };

    const scheduleUpdate = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }

      frame = requestAnimationFrame(updateCurrentPageFromViewport);
    };

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    const debugTick = window.setInterval(() => {
      if (readerDebug) {
        forceDebugTick((value) => value + 1);
      }
    }, 250);

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      window.clearInterval(debugTick);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [readerMode, state?.documentHandle, state?.totalPages, state?.currentPage, readerDebug]);

  useEffect(() => {
    if (!state || readerMode !== "scroll" || initialScrollDoneRef.current) {
      return;
    }

    const pending = pendingRestoreRef.current ?? { page: state.currentPage, position: 0 };
    const target = pageRefs.current.get(pending.page);
    if (!target) {
      return;
    }

    const hasLocalScrollTarget = pending.scrollY !== undefined;
    const desiredScrollTop =
      pending.scrollY ??
      (() => {
        const rect = getPageMeasurementRect(target);
        const absoluteTop = window.scrollY + rect.top;
        return absoluteTop + rect.height * pending.position - getReaderAnchorY();
      })();

    const exactScrollTarget = Math.max(0, desiredScrollTop);
    setRestoreDebugSnapshot({
      source: hasLocalScrollTarget ? "local-scroll" : "computed-anchor",
      targetScrollY: exactScrollTarget,
    });
    forceWindowScroll(exactScrollTarget);

    let secondFrame = 0;
    let thirdFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (pending.scrollY !== undefined) {
          forceWindowScroll(exactScrollTarget);
        }
        pendingRestoreRef.current = null;
        trackedScrollProgressRef.current = {
          page: pending.page,
          position: pending.position,
        };
        setScrollAnchorVersion((value) => value + 1);
        initialScrollDoneRef.current = true;

        if (pending.scrollY !== undefined) {
          thirdFrame = requestAnimationFrame(() => {
            forceWindowScroll(exactScrollTarget);
          });
        }
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) {
        cancelAnimationFrame(secondFrame);
      }
      if (thirdFrame) {
        cancelAnimationFrame(thirdFrame);
      }
    };
  }, [readerMode, state?.currentPage, state?.documentHandle, pageRenderWidth, pageMountVersion]);

  useEffect(() => {
    if (!state || readerMode !== "scroll" || !initialScrollDoneRef.current) {
      return;
    }

    const previousLayout = previousLayoutRef.current;
    const documentChanged = previousLayout.documentHandle !== state.documentHandle;
    const widthChanged = previousLayout.pageRenderWidth !== pageRenderWidth;
    previousLayoutRef.current = {
      pageRenderWidth,
      documentHandle: state.documentHandle,
    };

    if (!widthChanged || documentChanged) {
      return;
    }

    const tracked = trackedScrollProgressRef.current;
    const timeout = window.setTimeout(() => {
      const target = pageRefs.current.get(tracked.page);
      if (!target) {
        return;
      }

      const rect = getPageMeasurementRect(target);
      const absoluteTop = window.scrollY + rect.top;
      const desiredScrollTop = absoluteTop + rect.height * tracked.position - getReaderAnchorY();
      window.scrollTo({ top: Math.max(0, desiredScrollTop), behavior: "auto" });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [pageRenderWidth, readerMode, state?.documentHandle]);

  useEffect(() => {
    if (!readerDebug || !state) {
      return;
    }

    void debugPdfAnnotations(state.documentHandle, state.currentPage).then((annotations) => {
      console.log("[minibook] PDF annotations", {
        page: state.currentPage,
        annotations,
      });
    }).catch((error) => {
      console.log("[minibook] PDF annotation debug failed", error);
    });
  }, [readerDebug, state?.currentPage, state?.documentHandle]);

  useEffect(() => {
    if (!bookId || !state) {
      return;
    }

    const currentPage = readerMode === "scroll" ? trackedScrollProgressRef.current.page : state.currentPage;
    const totalPages = state.totalPages;
    const previous = state.progress;
    const positionInPage = readerMode === "scroll" ? trackedScrollProgressRef.current.position : 0;

    const timeout = window.setTimeout(() => {
      if (readerMode === "scroll" && bookId && initialScrollDoneRef.current) {
        writeLocalScrollResume(bookId, {
          mode: readerMode,
          zoom,
          viewportWidth,
          scrollY: window.scrollY,
        });
      }

      void saveBookProgress(bookId, currentPage, totalPages, positionInPage, previous).then((progress) => {
        sync.markBookPending(bookId);
        setState((current) => (current ? { ...current, progress } : current));
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [bookId, state?.currentPage, state?.totalPages, readerMode, scrollAnchorVersion, zoom, viewportWidth]);

  useEffect(() => {
    if (!bookId || !state) {
      return;
    }

    const saveOnHide = () => {
      if (document.visibilityState === "visible") {
        return;
      }

      const liveProgress = getLiveReaderProgress(
        pageRefs.current,
        readerMode,
        state.currentPage,
        trackedScrollProgressRef.current,
      );

      const nextProgress = buildCurrentProgressSnapshot(
        bookId,
        liveProgress.page,
        state.totalPages,
        liveProgress.position,
        state.progress,
      );

      if (readerMode === "scroll" && bookId && initialScrollDoneRef.current) {
        writeLocalScrollResume(bookId, {
          mode: readerMode,
          zoom,
          viewportWidth,
          scrollY: window.scrollY,
        });
      }

      sync.markBookPending(bookId);
      void replaceLocalProgress(nextProgress, true);
      if (auth.isAuthenticated) {
        syncBookProgressToDriveKeepalive(bookId, nextProgress);
      }
    };

    const syncOnPageHide = () => {
      const liveProgress = getLiveReaderProgress(
        pageRefs.current,
        readerMode,
        state.currentPage,
        trackedScrollProgressRef.current,
      );

      const nextProgress = buildCurrentProgressSnapshot(
        bookId,
        liveProgress.page,
        state.totalPages,
        liveProgress.position,
        state.progress,
      );

      if (readerMode === "scroll" && initialScrollDoneRef.current) {
        writeLocalScrollResume(bookId, {
          mode: readerMode,
          zoom,
          viewportWidth,
          scrollY: window.scrollY,
        });
      }

      sync.markBookPending(bookId);
      void replaceLocalProgress(nextProgress, true);
      if (auth.isAuthenticated) {
        syncBookProgressToDriveKeepalive(bookId, nextProgress);
      }
    };

    document.addEventListener("visibilitychange", saveOnHide);
    window.addEventListener("beforeunload", saveOnHide);
    window.addEventListener("pagehide", syncOnPageHide);

    return () => {
      document.removeEventListener("visibilitychange", saveOnHide);
      window.removeEventListener("beforeunload", saveOnHide);
      window.removeEventListener("pagehide", syncOnPageHide);
    };
  }, [auth.isAuthenticated, bookId, state, readerMode, zoom, viewportWidth]);

  useEffect(() => {
    if (!bookId || !state?.progress?.pending_sync || !auth.isAuthenticated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void performBackgroundSync("Syncing latest progress...");
    }, 30_000);

    return () => window.clearTimeout(timeout);
  }, [auth.isAuthenticated, bookId, state?.progress?.pending_sync, state?.progress?.updated_at]);

  useEffect(() => {
    return () => {
      const snapshot = latestUnmountSnapshotRef.current;
      if (!snapshot.bookId || !snapshot.state) {
        return;
      }

      const liveProgress = getLiveReaderProgress(
        pageRefs.current,
        snapshot.readerMode,
        snapshot.state.currentPage,
        trackedScrollProgressRef.current,
      );

      const nextProgress = buildCurrentProgressSnapshot(
        snapshot.bookId,
        liveProgress.page,
        snapshot.state.totalPages,
        liveProgress.position,
        snapshot.state.progress,
      );

      if (snapshot.readerMode === "scroll" && initialScrollDoneRef.current) {
        writeLocalScrollResume(snapshot.bookId, {
          mode: snapshot.readerMode,
          zoom: snapshot.zoom,
          viewportWidth: snapshot.viewportWidth,
          scrollY: window.scrollY,
        });
      }

      sync.markBookPending(snapshot.bookId);
      void replaceLocalProgress(nextProgress, true);
      if (snapshot.isAuthenticated) {
        syncBookProgressToDriveKeepalive(snapshot.bookId, nextProgress);
      }
    };
  }, []);

  useEffect(() => {
    if (!bookId || !state?.progress?.pending_sync || !auth.isAuthenticated) {
      return;
    }

    const handleOnline = () => {
      void performBackgroundSync("Back online. Syncing progress...");
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [auth.isAuthenticated, bookId, state?.progress?.pending_sync, state?.progress?.updated_at]);

  useEffect(() => {
    if (!bookId || !state?.progress?.pending_sync || !auth.isAuthenticated) {
      return;
    }

    const syncOnHide = () => {
      if (document.visibilityState === "visible") {
        return;
      }

      void performBackgroundSync("Saving and syncing before you leave...");
    };

    document.addEventListener("visibilitychange", syncOnHide);
    return () => document.removeEventListener("visibilitychange", syncOnHide);
  }, [auth.isAuthenticated, bookId, state?.progress?.pending_sync, state?.progress?.updated_at]);

  useEffect(() => {
    if (!bookId || !state || !auth.isAuthenticated || !navigator.onLine) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      const liveProgress = getLiveReaderProgress(
        pageRefs.current,
        readerMode,
        state.currentPage,
        trackedScrollProgressRef.current,
      );

      try {
        const insight = await loadRemoteProgressInsight(
          bookId,
          state.progress
            ? {
                ...state.progress,
                page: liveProgress.page,
                position_in_page: liveProgress.position,
                logical_progress: state.totalPages > 0 ? Math.min(1, Math.max(0, liveProgress.page / state.totalPages)) : 0,
              }
            : null,
        );

        if (cancelled) {
          return;
        }

        setRemoteInsight(insight);

        const latestOtherUpdate = insight.latest_other_device_record?.updated_at ?? null;
        if (
          latestOtherUpdate &&
          dismissedRemoteNoticeAtRef.current &&
          latestOtherUpdate <= dismissedRemoteNoticeAtRef.current
        ) {
          return;
        }

        setRemoteNotice(getReaderRemoteNotice(insight));
      } catch {
        if (!cancelled) {
          setRemoteNotice(null);
        }
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 45_000);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [auth.isAuthenticated, bookId, readerMode, state]);

  function goToPage(pageNumber: number, behavior: ScrollBehavior = "smooth") {
    setState((current) => {
      if (!current) {
        return current;
      }

      const nextPage = clamp(pageNumber, 1, current.totalPages);

      if (readerMode === "scroll") {
        initialScrollDoneRef.current = true;
        pendingRestoreRef.current = null;
        trackedScrollProgressRef.current = { page: nextPage, position: 0 };
        setScrollAnchorVersion((value) => value + 1);
        const target = pageRefs.current.get(nextPage);
        if (target) {
          const rect = getPageMeasurementRect(target);
          const absoluteTop = window.scrollY + rect.top;
          const desiredScrollTop = absoluteTop - getReaderAnchorY() + 24;
          window.scrollTo({ top: Math.max(0, desiredScrollTop), behavior });
        }
      }

      return {
        ...current,
        currentPage: nextPage,
      };
    });
  }

  function moveRelative(delta: -1 | 1) {
    if (!state) {
      return;
    }

    goToPage(state.currentPage + delta);
  }

  function handlePageJumpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) {
      return;
    }

    const nextPage = Number(pageJumpValue);
    if (!Number.isFinite(nextPage)) {
      setPageJumpValue(String(state.currentPage));
      return;
    }

    goToPage(nextPage);
  }

  function handleLeaveReader() {
    if (bookId && state) {
      const liveProgress = getLiveReaderProgress(
        pageRefs.current,
        readerMode,
        state.currentPage,
        trackedScrollProgressRef.current,
      );

      const nextProgress = buildCurrentProgressSnapshot(
        bookId,
        liveProgress.page,
        state.totalPages,
        liveProgress.position,
        state.progress,
      );

      if (readerMode === "scroll" && initialScrollDoneRef.current) {
        writeLocalScrollResume(bookId, {
          mode: readerMode,
          zoom,
          viewportWidth,
          scrollY: window.scrollY,
        });
      }

      sync.markBookPending(bookId);
      void replaceLocalProgress(nextProgress, true);
      if (auth.isAuthenticated) {
        syncBookProgressToDriveKeepalive(bookId, nextProgress);
      }
    }
  }

  async function handleDriveSync() {
    if (!bookId || !state) {
      return;
    }

    setDriveBusy(true);
    setDriveMessage("Syncing progress to Drive...");

    try {
      const liveProgress = getLiveReaderProgress(
        pageRefs.current,
        readerMode,
        state.currentPage,
        trackedScrollProgressRef.current,
      );

      const currentProgress = await saveBookProgress(
        bookId,
        liveProgress.page,
        state.totalPages,
        liveProgress.position,
        state.progress,
      );

      setState((current) => (current ? { ...current, progress: currentProgress } : current));
      const result = await sync.syncBook(bookId, currentProgress);
      const remoteFiles = await readRemoteBookProgress(bookId);
      const remoteRecords = remoteFiles.files
        .map((entry) => entry.record)
        .filter((entry): entry is ProgressRecord => entry !== null);
      const insight = summarizeRemoteProgress(result.progress, remoteRecords, getOrCreateDeviceId());
      setState((current) => (current ? { ...current, progress: result.progress } : current));
      setRemoteInsight(insight);
      setRemoteNotice(getReaderRemoteNotice(insight));
      setDriveMessage(`Synced page ${result.progress.page}. Drive now has ${remoteFiles.files.length} device file${remoteFiles.files.length === 1 ? "" : "s"} for this book.`);
      setSyncStatus("Progress is synced.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Drive sync failed.";
      setDriveMessage(message);
      sync.markBookError(bookId, message);
      setSyncStatus(getSyncFailureMessage(caught));
    } finally {
      setDriveBusy(false);
    }
  }

  async function performBackgroundSync(nextMessage: string) {
    if (!bookId || !state?.progress || driveBusy) {
      return;
    }

    try {
      setSyncStatus(nextMessage);
      const result = await sync.syncBook(bookId, state.progress);
      setState((current) => (current ? { ...current, progress: result.progress } : current));
      setSyncStatus("Progress is synced.");
    } catch (caught) {
      sync.markBookError(bookId, caught instanceof Error ? caught.message : "Drive sync failed.");
      setSyncStatus(getSyncFailureMessage(caught));
    }
  }

  if (error) {
    return (
      <div className="reader-shell">
        <div className="page-wrap">
          <div className="empty-state">
            <div className="empty-state-card">
              <h2>Reader unavailable</h2>
              <p>{error}</p>
              <Link className="primary-button" to="/">Return to library</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="reader-shell">
        <header className="reader-topbar">
          <div className="reader-topbar-left">
            <a className="icon-button reader-nav-button" href="/" onClick={handleLeaveReader}>
              <MaterialIcon>arrow_back</MaterialIcon>
            </a>
            <div className="reader-title">
              <h1>Opening book</h1>
              <span>{loadingMessage}</span>
            </div>
          </div>
        </header>
        <main className="reader-main reader-main-centered">
          <div className="page-stack">
            <div className="page-paper page-loading">{loadingMessage}</div>
          </div>
        </main>
      </div>
    );
  }

  const percent = Math.round((state.currentPage / state.totalPages) * 100);
  const pages = range(state.totalPages);
  const shellClass = `reader-shell reader-theme-${theme}${chromeHidden ? " reader-chrome-hidden" : ""}`;
  const renderedPages = new Set(
    readerMode === "flip"
      ? [state.currentPage]
      : pages.filter((pageNumber) => Math.abs(pageNumber - state.currentPage) <= VIRTUAL_WINDOW),
  );

  return (
    <div className={shellClass}>
      <header className="reader-topbar">
        <div className="reader-topbar-left">
          <a className="icon-button reader-nav-button" href="/" onClick={handleLeaveReader}>
            <MaterialIcon>arrow_back</MaterialIcon>
          </a>

          <div className="reader-title">
            <h1>{state.title}</h1>
            <span>{readerMode === "scroll" ? "Continuous Scroll" : "Page Flip"} mode</span>
          </div>
        </div>

        <div className="reader-toolbar">
          <div className="reader-controls">
            <button type="button" className="icon-button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.7, 2))}>
              <MaterialIcon>remove</MaterialIcon>
            </button>
            <div className="reader-zoom-label">{Math.round(zoom * 100)}%</div>
            <button type="button" className="icon-button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.7, 2))}>
              <MaterialIcon>add</MaterialIcon>
            </button>
          </div>

          <div className="reader-controls">
            <button
              type="button"
              className={`reader-pill-button${readerMode === "flip" ? " active" : ""}`}
              onClick={() => setReaderMode("flip")}
            >
              Page Flip
            </button>
            <button
              type="button"
              className={`reader-pill-button${readerMode === "scroll" ? " active" : ""}`}
              onClick={() => setReaderMode("scroll")}
            >
              Scroll
            </button>
          </div>

          <div className="reader-controls">
            <button type="button" className="icon-button" onClick={() => setShowAppearanceMenu((value) => !value)}>
              <MaterialIcon>contrast</MaterialIcon>
            </button>
          </div>

          {auth.isAuthenticated ? (
            <div className="reader-controls">
              <button type="button" className="reader-pill-button" onClick={() => void handleDriveSync()} disabled={driveBusy}>
                {driveBusy ? "Syncing..." : "Sync Now"}
              </button>
            </div>
          ) : null}

          <div className="reader-controls">
            <button
              type="button"
              className={`reader-pill-button${readerDebug ? " active" : ""}`}
              onClick={() => setReaderDebug((value) => !value)}
            >
              Debug
            </button>
          </div>
        </div>
      </header>

      {showAppearanceMenu ? (
        <div className="reader-appearance-menu">
          <div className="reader-appearance-title">Appearance</div>
          <div className="reader-appearance-swatches">
            <button type="button" className={`reader-swatch reader-swatch-light${theme === "light" ? " active" : ""}`} onClick={() => setTheme("light")} aria-label="Light theme" />
            <button type="button" className={`reader-swatch reader-swatch-sepia${theme === "sepia" ? " active" : ""}`} onClick={() => setTheme("sepia")} aria-label="Sepia theme" />
            <button type="button" className={`reader-swatch reader-swatch-slate${theme === "slate" ? " active" : ""}`} onClick={() => setTheme("slate")} aria-label="Slate theme" />
          </div>
          <div className="reader-appearance-note">
            PDF colors are transformed client-side for sepia and slate themes.
          </div>
        </div>
      ) : null}

      {driveMessage ? (
        <div className="reader-drive-banner">
          {driveMessage}
        </div>
      ) : null}

      {remoteNotice ? (
        <div className="reader-remote-banner">
          <span>{remoteNotice}</span>
          <button
            type="button"
            className="reader-remote-dismiss"
            onClick={() => {
              dismissedRemoteNoticeAtRef.current = remoteInsight?.latest_other_device_record?.updated_at ?? Date.now();
              setRemoteNotice(null);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {readerDebug ? (
        <ReaderDebugPanel
          state={state}
          bookId={bookId ?? ""}
          readerMode={readerMode}
          zoom={zoom}
          viewportWidth={viewportWidth}
          pendingRestore={pendingRestoreRef.current}
          trackedProgress={trackedScrollProgressRef.current}
          restoreDebugSnapshot={restoreDebugSnapshot}
        />
      ) : null}

      <main
        className="reader-main reader-main-centered"
        onClick={() => {
          setShowAppearanceMenu(false);
          setChromeHidden((value) => !value);
        }}
      >
        <div className="reader-canvas-area">
          {readerMode === "flip" ? (
            <div className="page-stack">
              <PageCanvas
                key={`flip-${state.currentPage}-${theme}`}
                documentHandle={state.documentHandle}
                pageNumber={state.currentPage}
                pageWidth={pageRenderWidth}
                theme={theme}
                aspectRatio={pageAspectRatios[state.currentPage]}
                onNavigateToPage={goToPage}
                onMount={(element) => bindPageRef(pageRefs.current, state.currentPage, element, setPageMountVersion)}
              />
            </div>
          ) : (
            <div className="page-stack continuous">
              {pages.map((pageNumber) => (
                <PageCanvas
                  key={`${pageNumber}-${theme}`}
                  documentHandle={state.documentHandle}
                  pageNumber={pageNumber}
                  pageWidth={pageRenderWidth}
                  theme={theme}
                  aspectRatio={pageAspectRatios[pageNumber]}
                  active={pageNumber === state.currentPage}
                  shouldRender={renderedPages.has(pageNumber)}
                  onNavigateToPage={goToPage}
                  onMount={(element) => bindPageRef(pageRefs.current, pageNumber, element, setPageMountVersion)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="reader-footer">
        <div className="reader-progress-meta">
          <div className="reader-progress-group">
            <strong>{state.currentPage} of {state.totalPages}</strong>
            <span>{syncStatus ? `${percent}% completed · ${syncStatus}` : `${percent}% completed`}</span>
          </div>

          <form className="reader-page-jump" onSubmit={handlePageJumpSubmit}>
            <span>Jump to page</span>
            <input
              type="number"
              min={1}
              max={state.totalPages}
              value={pageJumpValue}
              onChange={(event) => setPageJumpValue(event.target.value)}
            />
            <button type="submit" className="reader-jump-button">Go</button>
          </form>

          <div className="reader-progress-group">
            {remoteInsight?.device_count ? (
              <span className="reader-remote-meta">
                {remoteInsight.device_count} device{remoteInsight.device_count === 1 ? "" : "s"} synced
              </span>
            ) : null}
            <button type="button" className="icon-button" onClick={() => moveRelative(-1)} aria-label="Previous page">
              <MaterialIcon>chevron_left</MaterialIcon>
            </button>
            <button type="button" className="icon-button" onClick={() => moveRelative(1)} aria-label="Next page">
              <MaterialIcon>chevron_right</MaterialIcon>
            </button>
          </div>
        </div>

        <div className="reader-progress-line">
          <span style={{ width: `${percent}%` }} />
        </div>
      </footer>
    </div>
  );
}

type PageCanvasProps = {
  documentHandle: PdfDocumentHandle;
  pageNumber: number;
  pageWidth: number;
  theme: AppearanceTheme;
  aspectRatio?: number;
  active?: boolean;
  shouldRender?: boolean;
  onNavigateToPage: (pageNumber: number, behavior?: ScrollBehavior) => void;
  onMount: (element: HTMLDivElement | null) => void;
};

function PageCanvas({
  documentHandle,
  pageNumber,
  pageWidth,
  theme,
  aspectRatio: providedAspectRatio,
  active = false,
  shouldRender = true,
  onNavigateToPage,
  onMount,
}: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [aspectRatio, setAspectRatio] = useState(providedAspectRatio ?? DEFAULT_PAGE_ASPECT_RATIO);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [textItems, setTextItems] = useState<PdfTextLayerItem[]>([]);
  const [linkItems, setLinkItems] = useState<PdfLinkLayerItem[]>([]);

  useEffect(() => {
    const element = wrapRef.current;
    onMount(element);

    return () => onMount(null);
  }, [onMount]);

  useEffect(() => {
    if (providedAspectRatio) {
      setAspectRatio(providedAspectRatio);
      return;
    }

    let cancelled = false;

    async function loadAspectRatio() {
      try {
        const nextRatio = await getPdfPageAspectRatio(documentHandle, pageNumber);
        if (!cancelled) {
          setAspectRatio(nextRatio);
        }
      } catch {
        if (!cancelled) {
          setAspectRatio(DEFAULT_PAGE_ASPECT_RATIO);
        }
      }
    }

    void loadAspectRatio();

    return () => {
      cancelled = true;
    };
  }, [documentHandle, pageNumber, providedAspectRatio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shouldRender) {
      return;
    }

    const stableCanvas: HTMLCanvasElement = canvas;
    let cancelled = false;

    async function drawPage() {
      try {
        setRenderError(null);
        await renderPdfPage(stableCanvas, documentHandle, pageNumber, pageWidth);
      } catch (caught) {
        const isRenderCancellation =
          caught instanceof Error &&
          (caught.name === "RenderingCancelledException" || caught.message.includes("multiple render() operations"));

        if (!cancelled && !isRenderCancellation) {
          setRenderError(caught instanceof Error ? caught.message : "Unable to render this page.");
        }
      }
    }

    void drawPage();

    return () => {
      cancelled = true;
    };
  }, [documentHandle, pageNumber, pageWidth, shouldRender]);

  useEffect(() => {
    if (!shouldRender) {
      setTextItems([]);
      setLinkItems([]);
      return;
    }

    let cancelled = false;

    async function loadInteractiveLayers() {
      try {
        const [nextTextItems, nextLinkItems] = await Promise.all([
          getPdfTextLayerItems(documentHandle, pageNumber, pageWidth),
          getPdfLinkLayerItems(documentHandle, pageNumber, pageWidth),
        ]);

        if (!cancelled) {
          setTextItems(nextTextItems);
          setLinkItems(nextLinkItems);
        }
      } catch {
        if (!cancelled) {
          setTextItems([]);
          setLinkItems([]);
        }
      }
    }

    void loadInteractiveLayers();

    return () => {
      cancelled = true;
    };
  }, [documentHandle, pageNumber, pageWidth, shouldRender]);

  const className = `page-paper page-paper-frame${active ? " active" : ""}`;
  const paperHeight = pageWidth * aspectRatio;

  return (
    <section
      ref={wrapRef}
      data-page-number={pageNumber}
      className={className}
      style={{ width: `${pageWidth}px`, minHeight: `${paperHeight}px` }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="page-paper-content">
        {renderError ? (
          <div className="page-loading">{renderError}</div>
        ) : shouldRender ? (
          <>
            <canvas ref={canvasRef} className={`reader-canvas reader-canvas-${theme}`} />
            <div className="reader-text-layer" aria-hidden="true">
              {textItems.map((item) => (
                <span
                  key={item.id}
                  className="reader-text-span"
                  style={{
                    left: `${item.left}px`,
                    top: `${item.top}px`,
                    width: `${item.width}px`,
                    height: `${item.height}px`,
                    fontSize: `${item.fontSize}px`,
                    transform: `rotate(${item.angle}rad)`,
                  }}
                >
                  {item.text}
                </span>
              ))}
            </div>
            <div className="reader-link-layer">
              {linkItems.map((item) => (
                item.url ? (
                  <a
                    key={item.id}
                    className="reader-link-hitbox"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      left: `${item.left}px`,
                      top: `${item.top}px`,
                      width: `${item.width}px`,
                      height: `${item.height}px`,
                    }}
                    onClick={(event) => event.stopPropagation()}
                    aria-label="Open PDF link"
                  />
                ) : item.pageNumber ? (
                  <button
                    key={item.id}
                    type="button"
                    className="reader-link-hitbox reader-link-hitbox-button"
                    style={{
                      left: `${item.left}px`,
                      top: `${item.top}px`,
                      width: `${item.width}px`,
                      height: `${item.height}px`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onNavigateToPage(item.pageNumber!, "auto");
                    }}
                    aria-label={`Jump to page ${item.pageNumber}`}
                  />
                ) : null
              ))}
            </div>
          </>
        ) : (
          <div className="page-canvas-placeholder" style={{ width: `${pageWidth}px`, height: `${paperHeight}px` }} />
        )}
      </div>
    </section>
  );
}

function MaterialIcon({ children }: { children: string }) {
  return <span className="material-symbols-outlined">{children}</span>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function range(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1);
}

function bindPageRef(
  map: Map<number, HTMLDivElement>,
  pageNumber: number,
  element: HTMLDivElement | null,
  notifyMounted: Dispatch<SetStateAction<number>>,
) {
  if (element) {
    map.set(pageNumber, element);
    notifyMounted((value) => value + 1);
    return;
  }

  map.delete(pageNumber);
}

function readStoredReaderMode(): ReaderMode {
  const value = localStorage.getItem(READER_MODE_KEY);
  return value === "scroll" ? "scroll" : "flip";
}

function readStoredZoom(): number {
  const value = Number(localStorage.getItem(READER_ZOOM_KEY));
  return Number.isFinite(value) ? clamp(value, 0.7, 2) : 1;
}

function getLocalScrollResumeKey(bookId: string) {
  return `minibook:local-scroll:${bookId}`;
}

function readLocalScrollResume(bookId: string): LocalScrollResume | null {
  const raw = localStorage.getItem(getLocalScrollResumeKey(bookId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalScrollResume>;
    if (
      (parsed.mode === "scroll" || parsed.mode === "flip") &&
      typeof parsed.zoom === "number" &&
      typeof parsed.viewportWidth === "number" &&
      typeof parsed.scrollY === "number"
    ) {
      return parsed as LocalScrollResume;
    }
  } catch {
    return null;
  }

  return null;
}

function writeLocalScrollResume(bookId: string, resume: LocalScrollResume) {
  localStorage.setItem(getLocalScrollResumeKey(bookId), JSON.stringify(resume));
}

function getReaderAnchorY() {
  const topbar = document.querySelector(".reader-topbar") as HTMLElement | null;
  const topbarHeight = topbar?.offsetHeight ?? 72;
  return topbarHeight + 32;
}

function forceWindowScroll(top: number) {
  window.scrollTo({ top, behavior: "auto" });
  document.documentElement.scrollTop = top;
  document.body.scrollTop = top;
}

function getPageRenderWidth(viewportWidth: number, zoom: number) {
  const availableWidth = Math.min(Math.max(320, viewportWidth - 96), 880);
  return Math.max(320, availableWidth * zoom);
}

function getPageMeasurementRect(element: HTMLDivElement) {
  const content = element.querySelector(".page-paper-content") as HTMLElement | null;
  return (content ?? element).getBoundingClientRect();
}

type ReaderDebugPanelProps = {
  state: ReaderState;
  bookId: string;
  readerMode: ReaderMode;
  zoom: number;
  viewportWidth: number;
  pendingRestore: PendingRestore | null;
  trackedProgress: { page: number; position: number };
  restoreDebugSnapshot: RestoreDebugSnapshot | null;
};

function ReaderDebugPanel({
  state,
  bookId,
  readerMode,
  zoom,
  viewportWidth,
  pendingRestore,
  trackedProgress,
  restoreDebugSnapshot,
}: ReaderDebugPanelProps) {
  const localResume = bookId ? readLocalScrollResume(bookId) : null;

  return (
    <aside className="reader-debug-panel">
      <div><strong>mode</strong> {readerMode}</div>
      <div><strong>zoom</strong> {zoom.toFixed(2)}</div>
      <div><strong>viewport</strong> {viewportWidth}</div>
      <div><strong>state.page</strong> {state.currentPage}</div>
      <div><strong>saved.page</strong> {state.progress?.page ?? "-"}</div>
      <div><strong>saved.pos</strong> {formatDebugNumber(state.progress?.position_in_page)}</div>
      <div><strong>tracked.page</strong> {trackedProgress.page}</div>
      <div><strong>tracked.pos</strong> {formatDebugNumber(trackedProgress.position)}</div>
      <div><strong>pending.page</strong> {pendingRestore?.page ?? "-"}</div>
      <div><strong>pending.pos</strong> {formatDebugNumber(pendingRestore?.position)}</div>
      <div><strong>pending.scrollY</strong> {formatDebugNumber(pendingRestore?.scrollY)}</div>
      <div><strong>local.mode</strong> {localResume?.mode ?? "-"}</div>
      <div><strong>local.zoom</strong> {formatDebugNumber(localResume?.zoom)}</div>
      <div><strong>local.width</strong> {localResume?.viewportWidth ?? "-"}</div>
      <div><strong>local.scrollY</strong> {formatDebugNumber(localResume?.scrollY)}</div>
      <div><strong>restore.src</strong> {restoreDebugSnapshot?.source ?? "-"}</div>
      <div><strong>restore.scrollY</strong> {formatDebugNumber(restoreDebugSnapshot?.targetScrollY)}</div>
      <div><strong>scrollY</strong> {Math.round(window.scrollY)}</div>
      <div><strong>anchorY</strong> {Math.round(getReaderAnchorY())}</div>
    </aside>
  );
}

function formatDebugNumber(value: number | undefined) {
  return typeof value === "number" ? value.toFixed(4) : "-";
}

function getLiveReaderProgress(
  pageRefs: Map<number, HTMLDivElement>,
  readerMode: ReaderMode,
  fallbackPage: number,
  tracked: { page: number; position: number },
) {
  if (readerMode !== "scroll") {
    return {
      page: fallbackPage,
      position: 0,
    };
  }

  const anchorY = getReaderAnchorY();
  for (const [pageNumber, element] of pageRefs.entries()) {
    const rect = getPageMeasurementRect(element);
    if (rect.bottom >= anchorY) {
      return {
        page: pageNumber,
        position: clamp((anchorY - rect.top) / rect.height, 0, 1),
      };
    }
  }

  return tracked;
}

function buildCurrentProgressSnapshot(
  bookId: string,
  page: number,
  totalPages: number,
  positionInPage: number,
  previous?: ProgressRecord,
): ProgressRecord {
  const now = Date.now();
  return {
    book_id: bookId,
    device_id: previous?.device_id ?? getOrCreateDeviceId(),
    session_id: previous?.session_id ?? crypto.randomUUID(),
    page,
    position_in_page: positionInPage,
    logical_progress: totalPages > 0 ? Math.min(1, Math.max(0, page / totalPages)) : 0,
    opened_at: previous?.opened_at ?? now,
    updated_at: now,
    pending_sync: true,
  };
}

function getSyncFailureMessage(caught: unknown) {
  if (!navigator.onLine) {
    return "Offline. Saving progress locally.";
  }

  if (caught instanceof Error) {
    const message = caught.message.toLowerCase();
    if (message.includes("failed to fetch") || message.includes("network")) {
      return "Network unavailable. Saving progress locally.";
    }

    if (message.includes("not signed in")) {
      return "Sign in to sync. Progress is still saved locally.";
    }
  }

  return "Sync unavailable. Progress is still saved locally.";
}

async function loadAllPageAspectRatios(
  documentHandle: PdfDocumentHandle,
  totalPages: number,
) {
  const ratios: Record<number, number> = {};

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    try {
      ratios[pageNumber] = await getPdfPageAspectRatio(documentHandle, pageNumber);
    } catch {
      ratios[pageNumber] = DEFAULT_PAGE_ASPECT_RATIO;
    }
  }

  return ratios;
}
