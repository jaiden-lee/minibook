import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

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

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise;
}
