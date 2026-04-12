import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

const activeRenderTasks = new WeakMap<
  HTMLCanvasElement,
  {
    cancel: () => void;
    promise: Promise<unknown>;
  }
>();

export type PdfDocumentHandle = Awaited<ReturnType<typeof loadPdfDocument>>;

export async function loadPdfDocument(data: ArrayBuffer) {
  const task = getDocument({ data });
  return task.promise;
}

export async function renderPdfPage(
  canvas: HTMLCanvasElement,
  documentHandle: PdfDocumentHandle,
  pageNumber: number,
  width: number,
): Promise<void> {
  const page = await documentHandle.getPage(pageNumber);
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = width / initialViewport.width;
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  const activeTask = activeRenderTasks.get(canvas);
  if (activeTask) {
    activeTask.cancel();

    try {
      await activeTask.promise;
    } catch {
      // PDF.js rejects canceled render tasks; that is expected here.
    }
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const renderTask = page.render({
    canvas,
    canvasContext: context,
    viewport,
  });

  activeRenderTasks.set(canvas, renderTask);

  try {
    await renderTask.promise;
  } finally {
    if (activeRenderTasks.get(canvas) === renderTask) {
      activeRenderTasks.delete(canvas);
    }
  }
}

export async function getPdfPageAspectRatio(
  documentHandle: PdfDocumentHandle,
  pageNumber: number,
): Promise<number> {
  const page = await documentHandle.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  return viewport.height / viewport.width;
}
