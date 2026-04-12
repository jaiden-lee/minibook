import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ProgressRecord } from "@minibook/shared-types";
import { openLocalBook, saveBookProgress } from "@/lib/library";
import { loadPdfDocument, renderPdfPage, type PdfDocumentHandle } from "@/lib/pdf";

type ReaderState = {
  title: string;
  totalPages: number;
  currentPage: number;
  progress?: ProgressRecord;
  documentHandle: PdfDocumentHandle;
};

export function ReaderPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ReaderState | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Checking latest progress...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) {
      navigate("/");
      return;
    }

    const currentBookId: string = bookId;

    let disposed = false;

    async function load() {
      try {
        setError(null);
        setLoadingMessage("Checking latest progress...");
        const opened = await openLocalBook(currentBookId);
        setLoadingMessage("Preparing your reading view...");
        const documentHandle = await loadPdfDocument(opened.bytes);

        if (disposed) {
          return;
        }

        setState({
          title: opened.book.title,
          totalPages: documentHandle.numPages,
          currentPage: opened.progress?.page ?? 1,
          progress: opened.progress,
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
  }, [bookId, navigate]);

  useEffect(() => {
    const readerState = state;
    const canvas = canvasRef.current;
    const pageWrap = pageWrapRef.current;

    if (!readerState || !canvas || !pageWrap) {
      return;
    }

    let cancelled = false;

    async function drawPage() {
      try {
        const width = Math.min(pageWrap!.clientWidth, 880) - 64;
        await renderPdfPage(canvas!, readerState!.documentHandle, readerState!.currentPage, width);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to render the current page.");
        }
      }
    }

    void drawPage();

    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    if (!bookId || !state) {
      return;
    }

    const currentPage = state.currentPage;
    const totalPages = state.totalPages;
    const previous = state.progress;

    const timeout = window.setTimeout(() => {
      void saveBookProgress(bookId, currentPage, totalPages, previous).then((progress) => {
        setState((current) => (current ? { ...current, progress } : current));
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [bookId, state?.currentPage, state?.totalPages]);

  useEffect(() => {
    if (!bookId || !state) {
      return;
    }

    const currentPage = state.currentPage;
    const totalPages = state.totalPages;
    const previous = state.progress;

    const saveOnHide = () => {
      if (document.visibilityState === "visible") {
        return;
      }

      void saveBookProgress(bookId, currentPage, totalPages, previous);
    };

    document.addEventListener("visibilitychange", saveOnHide);
    window.addEventListener("beforeunload", saveOnHide);

    return () => {
      document.removeEventListener("visibilitychange", saveOnHide);
      window.removeEventListener("beforeunload", saveOnHide);
    };
  }, [bookId, state]);

  if (error) {
    return (
      <div className="reader-shell">
        <div className="page-wrap">
          <div className="empty-state">
            <div className="empty-state-card">
              <h2>Reader unavailable</h2>
              <p>{error}</p>
              <Link
                className="primary-button"
                to="/"
              >
                Return to library
              </Link>
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
          <Link
            className="tertiary-button"
            to="/"
          >
            <MaterialIcon>arrow_back</MaterialIcon>
            <span>Library</span>
          </Link>
        </header>
        <main className="reader-main">
          <section className="page-panel">
            <div className="page-stage">
              <div className="page-paper page-loading">{loadingMessage}</div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const percent = Math.round((state.currentPage / state.totalPages) * 100);

  return (
    <div className="reader-shell">
      <header className="reader-topbar">
        <div className="reader-title">
          <Link
            className="tertiary-button"
            to="/"
          >
            <MaterialIcon>arrow_back</MaterialIcon>
            <span>Library</span>
          </Link>
          <h1>{state.title}</h1>
          <span>Checking local-first reading progress</span>
        </div>

        <div className="reader-controls">
          <button
            type="button"
            className="icon-button"
            onClick={() =>
              setState((current) =>
                current
                  ? {
                      ...current,
                      currentPage: Math.max(1, current.currentPage - 1),
                    }
                  : current,
              )
            }
            aria-label="Previous page"
          >
            <MaterialIcon>chevron_left</MaterialIcon>
          </button>
          <div style={{ minWidth: "6.25rem", textAlign: "center", fontWeight: 600 }}>
            {state.currentPage} / {state.totalPages}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() =>
              setState((current) =>
                current
                  ? {
                      ...current,
                      currentPage: Math.min(current.totalPages, current.currentPage + 1),
                    }
                  : current,
              )
            }
            aria-label="Next page"
          >
            <MaterialIcon>chevron_right</MaterialIcon>
          </button>
        </div>
      </header>

      <main className="reader-main">
        <section className="page-panel">
          <div
            className="page-stage"
            ref={pageWrapRef}
          >
            <div className="page-paper">
              <canvas ref={canvasRef} />
            </div>
          </div>
        </section>

        <aside className="reader-sidepanel">
          <h2>Session Notes</h2>
          <dl>
            <div>
              <dt>Source</dt>
              <dd>Local browser storage</dd>
            </div>
            <div>
              <dt>Resume point</dt>
              <dd>{state.progress ? `Restored page ${state.progress.page}` : "Started from page 1"}</dd>
            </div>
            <div>
              <dt>Sync status</dt>
              <dd>Saved locally first. Drive sync is not connected yet.</dd>
            </div>
            <div>
              <dt>Book position</dt>
              <dd>{percent}% complete</dd>
            </div>
          </dl>

          <div className="reader-actions" style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setState((current) =>
                  current
                    ? {
                        ...current,
                        currentPage: 1,
                      }
                    : current,
                )
              }
            >
              <MaterialIcon>first_page</MaterialIcon>
              <span>Start Over</span>
            </button>
          </div>
        </aside>
      </main>

      <footer className="reader-footer">
        <div className="reader-progress-meta">
          <span>
            Page {state.currentPage} of {state.totalPages}
          </span>
          <span>{percent}% completed</span>
        </div>
        <div className="reader-progress-line">
          <span style={{ width: `${percent}%` }} />
        </div>
      </footer>
    </div>
  );
}

function MaterialIcon({ children }: { children: string }) {
  return <span className="material-symbols-outlined">{children}</span>;
}
