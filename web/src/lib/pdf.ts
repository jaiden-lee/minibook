import { GlobalWorkerOptions, Util, getDocument } from "pdfjs-dist";
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
export type PdfTextLayerItem = {
  id: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  angle: number;
};
export type PdfLinkLayerItem = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  url?: string;
  pageNumber?: number;
};

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

export async function getPdfTextLayerItems(
  documentHandle: PdfDocumentHandle,
  pageNumber: number,
  width: number,
): Promise<PdfTextLayerItem[]> {
  const page = await documentHandle.getPage(pageNumber);
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = width / initialViewport.width;
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();

  return textContent.items.flatMap((item, index) => {
    if (!("str" in item) || typeof item.str !== "string" || item.str.length === 0) {
      return [];
    }

    const transform = Util.transform(viewport.transform, item.transform);
    const angle = Math.atan2(transform[1], transform[0]);
    const fontSize = Math.hypot(transform[2], transform[3]);
    const widthPx = item.width * scale;
    const heightPx = item.height * scale || fontSize;

    return [{
      id: `${pageNumber}-${index}`,
      text: item.str,
      left: transform[4],
      top: transform[5] - fontSize,
      width: widthPx,
      height: heightPx,
      fontSize,
      angle,
    }];
  });
}

export async function getPdfLinkLayerItems(
  documentHandle: PdfDocumentHandle,
  pageNumber: number,
  width: number,
): Promise<PdfLinkLayerItem[]> {
  const page = await documentHandle.getPage(pageNumber);
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = width / initialViewport.width;
  const viewport = page.getViewport({ scale });
  const annotations = await page.getAnnotations({ intent: "display" });
  const items: PdfLinkLayerItem[] = [];

  for (let index = 0; index < annotations.length; index += 1) {
    const annotation = annotations[index];
    if (annotation.subtype !== "Link" || !Array.isArray(annotation.rect)) {
      continue;
    }

    const rect = viewport.convertToViewportRectangle(annotation.rect);
    const left = Math.min(rect[0], rect[2]);
    const top = Math.min(rect[1], rect[3]);
    const item: PdfLinkLayerItem = {
      id: `${pageNumber}-link-${index}`,
      left,
      top,
      width: Math.abs(rect[0] - rect[2]),
      height: Math.abs(rect[1] - rect[3]),
    };

    if (typeof annotation.url === "string" && annotation.url.length > 0) {
      item.url = annotation.url;
      items.push(item);
      continue;
    }

    if (typeof annotation.unsafeUrl === "string" && annotation.unsafeUrl.length > 0) {
      item.url = annotation.unsafeUrl;
      items.push(item);
      continue;
    }

    const destination = await resolveDestination(documentHandle, annotation.dest);
    if (destination) {
      item.pageNumber = destination;
      items.push(item);
    }
  }

  return items;
}

export async function debugPdfAnnotations(
  documentHandle: PdfDocumentHandle,
  pageNumber: number,
) {
  const page = await documentHandle.getPage(pageNumber);
  const annotations = await page.getAnnotations({ intent: "display" });

  return annotations.map((annotation, index) => ({
    index,
    subtype: annotation.subtype ?? null,
    url: typeof annotation.url === "string" ? annotation.url : null,
    unsafeUrl: typeof annotation.unsafeUrl === "string" ? annotation.unsafeUrl : null,
    dest: "dest" in annotation ? annotation.dest ?? null : null,
    action: "action" in annotation ? annotation.action ?? null : null,
    rect: Array.isArray(annotation.rect) ? annotation.rect : null,
    annotationType: "annotationType" in annotation ? annotation.annotationType ?? null : null,
    hasBorderStyle: "borderStyle" in annotation ? !!annotation.borderStyle : false,
  }));
}

async function resolveDestination(documentHandle: PdfDocumentHandle, destination: unknown): Promise<number | null> {
  if (!destination) {
    return null;
  }

  const explicitDest =
    typeof destination === "string"
      ? await documentHandle.getDestination(destination)
      : Array.isArray(destination)
        ? destination
        : null;

  if (!Array.isArray(explicitDest) || explicitDest.length === 0) {
    return null;
  }

  const target = explicitDest[0];
  if (typeof target === "number" && Number.isFinite(target)) {
    return target + 1;
  }

  if (isPdfRef(target)) {
    return (await documentHandle.getPageIndex(target)) + 1;
  }

  return null;
}

function isPdfRef(value: unknown): value is { num: number; gen: number } {
  return !!value
    && typeof value === "object"
    && "num" in value
    && "gen" in value
    && typeof value.num === "number"
    && typeof value.gen === "number";
}
