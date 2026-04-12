import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ProgressRecord } from "@minibook/shared-types";
import { openLocalBook, saveBookProgress } from "@/lib/library";
import { loadPdfDocument, renderPdfPage, type PdfDocumentHandle } from "@/lib/pdf";

type ReaderMode = "flip" | "scroll";
type ReaderTheme = "light" | "sepia" | "slate";

type ReaderState = {
  title: string;
  totalPages: number;
  currentPage: number;
  progress?: ProgressRecord;
  documentHandle: PdfDocumentHandle;
};

const READER_MODE_KEY = "minibook:reader-mode";
const READER_ZOOM_KEY = "minibook:reader-zoom";
const READER_THEME_KEY = "minibook:reader-theme";

export function ReaderPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const [state, setState] = useState<ReaderState | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Checking latest progress...");
  const [error, setError] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => readStoredReaderMode());
  const [zoom, setZoom] = useState<number>(() => readStoredZoom());
  const [theme, setTheme] = useState<ReaderTheme>(() => readStoredTheme());
  const [showAppearanceMenu, setShowAppearanceMenu] = useState(false);
  const initialScrollDoneRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(READER_MODE_KEY, readerMode);
  }, [readerMode]);

  useEffect(() => {
    localStorage.setItem(READER_ZOOM_KEY, String(zoom));
  }, [zoom]);

  useEffect(() => {
    localStorage.setItem(READER_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!bookId) {
      navigate("/");
      return;
    }

    const currentBookId = bookId;
    let disposed = false;
    initialScrollDoneRef.current = false;

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
    if (!state) {
      return;
    }

    if (readerMode !== "scroll") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) {
          return;
        }

        const page = Number((visible.target as HTMLElement).dataset.pageNumber);
        if (!Number.isFinite(page)) {
          return;
        }

        setState((current) => {
          if (!current || current.currentPage === page) {
            return current;
          }

          return {
            ...current,
            currentPage: page,
          };
        });
      },
      {
        root: null,
        threshold: [0.55, 0.7, 0.9],
      },
    );

    for (const element of pageRefs.current.values()) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [readerMode, state?.documentHandle, state?.totalPages]);

  useEffect(() => {
    if (!state || readerMode !== "scroll" || initialScrollDoneRef.current) {
      return;
    }

    const target = pageRefs.current.get(state.currentPage);
    if (!target) {
      return;
    }

    target.scrollIntoView({ block: "center" });
    initialScrollDoneRef.current = true;
  }, [readerMode, state?.currentPage, state?.documentHandle]);

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

  function moveRelative(delta: -1 | 1) {
    setState((current) => {
      if (!current) {
        return current;
      }

      const nextPage = clamp(current.currentPage + delta, 1, current.totalPages);

      if (readerMode === "scroll") {
        pageRefs.current.get(nextPage)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      return {
        ...current,
        currentPage: nextPage,
      };
    });
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
            <Link className="icon-button reader-nav-button" to="/">
              <MaterialIcon>arrow_back</MaterialIcon>
            </Link>
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
  const shellClass = `reader-shell reader-theme-${theme}`;

  return (
    <div className={shellClass}>
      <header className="reader-topbar">
        <div className="reader-topbar-left">
          <Link className="icon-button reader-nav-button" to="/">
            <MaterialIcon>arrow_back</MaterialIcon>
          </Link>

          <div className="reader-title">
            <h1>{state.title}</h1>
            <span>{readerMode === "scroll" ? "Continuous Scroll" : "Page Flip"} mode</span>
          </div>
        </div>

        <div className="reader-toolbar">
          <div className="reader-controls">
            <button type="button" className="icon-button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.8, 1.8))}>
              <MaterialIcon>remove</MaterialIcon>
            </button>
            <div className="reader-zoom-label">{Math.round(zoom * 100)}%</div>
            <button type="button" className="icon-button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.8, 1.8))}>
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
        </div>
      </header>

      {showAppearanceMenu ? (
        <div className="reader-appearance-menu">
          <div className="reader-appearance-title">Appearance</div>
          <div className="reader-appearance-swatches">
            <button
              type="button"
              className={`reader-swatch reader-swatch-light${theme === "light" ? " active" : ""}`}
              onClick={() => setTheme("light")}
              aria-label="Light theme"
            />
            <button
              type="button"
              className={`reader-swatch reader-swatch-sepia${theme === "sepia" ? " active" : ""}`}
              onClick={() => setTheme("sepia")}
              aria-label="Sepia theme"
            />
            <button
              type="button"
              className={`reader-swatch reader-swatch-slate${theme === "slate" ? " active" : ""}`}
              onClick={() => setTheme("slate")}
              aria-label="Slate theme"
            />
          </div>
        </div>
      ) : null}

      <main className="reader-main reader-main-centered">
        {readerMode === "flip" ? (
          <div className="page-stack">
            <PageCanvas
              key={`flip-${state.currentPage}`}
              documentHandle={state.documentHandle}
              pageNumber={state.currentPage}
              zoom={zoom}
              onMount={(element) => bindPageRef(pageRefs.current, state.currentPage, element)}
            />
          </div>
        ) : (
          <div className="page-stack continuous">
            {pages.map((pageNumber) => (
              <PageCanvas
                key={pageNumber}
                documentHandle={state.documentHandle}
                pageNumber={pageNumber}
                zoom={zoom}
                active={pageNumber === state.currentPage}
                onMount={(element) => bindPageRef(pageRefs.current, pageNumber, element)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="reader-footer">
        <div className="reader-progress-meta">
          <div className="reader-progress-group">
            <strong>{state.currentPage} of {state.totalPages}</strong>
            <span>{percent}% completed</span>
          </div>

          <div className="reader-progress-group">
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
  zoom: number;
  active?: boolean;
  onMount: (element: HTMLDivElement | null) => void;
};

function PageCanvas({ documentHandle, pageNumber, zoom, active = false, onMount }: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pageWidth, setPageWidth] = useState(760);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    onMount(element);

    return () => onMount(null);
  }, [onMount]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      const maxWidth = Math.min(element.clientWidth - 64, 880);
      setPageWidth(Math.max(320, maxWidth * zoom));
    });

    resizeObserver.observe(element);
    const maxWidth = Math.min(element.clientWidth - 64, 880);
    setPageWidth(Math.max(320, maxWidth * zoom));

    return () => resizeObserver.disconnect();
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
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
  }, [documentHandle, pageNumber, pageWidth]);

  return (
    <section
      ref={wrapRef}
      data-page-number={pageNumber}
      className={`page-paper page-paper-frame${active ? " active" : ""}`}
    >
      <div className="page-paper-label">Page {pageNumber}</div>
      {renderError ? <div className="page-loading">{renderError}</div> : <canvas ref={canvasRef} />}
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

function bindPageRef(map: Map<number, HTMLDivElement>, pageNumber: number, element: HTMLDivElement | null) {
  if (element) {
    map.set(pageNumber, element);
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
  return Number.isFinite(value) ? clamp(value, 0.8, 1.8) : 1;
}

function readStoredTheme(): ReaderTheme {
  const value = localStorage.getItem(READER_THEME_KEY);
  return value === "sepia" || value === "slate" ? value : "light";
}
