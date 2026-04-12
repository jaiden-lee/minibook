import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ChangeEvent } from "react";
import type { LibraryBook } from "@/lib/library";
import { canChooseDirectory, importBooksFromChosenDirectory, importBooksFromFiles, loadLibrary } from "@/lib/library";

export function LibraryPage() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void refreshLibrary();
  }, []);

  async function refreshLibrary() {
    setLoading(true);
    setError(null);

    try {
      setBooks(await loadLibrary());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load your library.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }

    setBusy("Importing PDFs...");
    setError(null);

    try {
      await importBooksFromFiles(files);
      await refreshLibrary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to import your PDFs.");
    } finally {
      event.target.value = "";
      setBusy(null);
    }
  }

  async function handleDirectoryImport() {
    setBusy("Scanning folder...");
    setError(null);

    try {
      await importBooksFromChosenDirectory();
      await refreshLibrary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to read the selected folder.");
    } finally {
      setBusy(null);
    }
  }

  const summary = useMemo(() => {
    if (!books.length) {
      return "Import a few PDFs to start building your quiet local library.";
    }

    const inProgress = books.filter((entry) => (entry.progress?.logical_progress ?? 0) > 0).length;
    return `${books.length} local books, ${inProgress} with saved reading progress.`;
  }, [books]);

  return (
    <div className="page-wrap">
      <section className="hero">
        <div>
          <h1>
            A local-first reader for your <em>own shelves.</em>
          </h1>
          <p>
            PDFs stay on this device. Progress saves here first, and this structure is ready for Drive sync in the
            next phase.
          </p>
        </div>

        <div className="action-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
          >
            <MaterialIcon>upload_file</MaterialIcon>
            <span>Import PDFs</span>
          </button>

          {canChooseDirectory() ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleDirectoryImport()}
              disabled={busy !== null}
            >
              <MaterialIcon>folder_open</MaterialIcon>
              <span>Choose Folder</span>
            </button>
          ) : null}
        </div>
      </section>

      <div style={{ marginBottom: "2rem" }} className="subtle-note">
        {busy ?? error ?? summary}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(event) => void handleFileImport(event)}
      />

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-card">
            <h2>Loading your library</h2>
            <p>Reassembling local metadata and saved reading positions.</p>
          </div>
        </div>
      ) : books.length ? (
        <section className="library-grid">
          {books.map(({ book, progress }) => {
            const percent = Math.round((progress?.logical_progress ?? 0) * 100);

            return (
              <Link
                key={book.book_id}
                className="book-card"
                to={`/read/${book.book_id}`}
              >
                <article className="book-cover">
                  <div className="book-cover-art">
                    <div className="book-cover-kicker">{book.original_filename}</div>
                    <div className="book-cover-title">{book.title}</div>
                    <div className="book-cover-kicker">{book.local_path}</div>
                  </div>
                </article>

                <div className="book-meta">
                  <h2>{book.title}</h2>
                  <p>{progress ? `Page ${progress.page}` : "Unread volume"}</p>
                </div>

                <div className="progress-row">
                  <div className="progress-line">
                    <div
                      className="progress-fill"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="progress-label">{percent}%</span>
                </div>
              </Link>
            );
          })}

          <button
            type="button"
            className="import-card"
            onClick={() => fileInputRef.current?.click()}
          >
            <div>
              <div style={{ marginBottom: "1rem" }}>
                <MaterialIcon>add</MaterialIcon>
              </div>
              <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700 }}>Import another PDF</div>
            </div>
          </button>
        </section>
      ) : (
        <div className="empty-state">
          <div className="empty-state-card">
            <h2>Your library starts local.</h2>
            <p>
              Import one or more PDFs, or point minibook at a folder if your browser supports local directory access.
            </p>
            <div className="action-row" style={{ justifyContent: "center" }}>
              <button
                type="button"
                className="primary-button"
                onClick={() => fileInputRef.current?.click()}
              >
                <MaterialIcon>upload_file</MaterialIcon>
                <span>Import PDFs</span>
              </button>
              {canChooseDirectory() ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleDirectoryImport()}
                >
                  <MaterialIcon>folder_open</MaterialIcon>
                  <span>Choose Folder</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialIcon({ children }: { children: string }) {
  return <span className="material-symbols-outlined">{children}</span>;
}
