import { createCanvas, Path2D as CanvasPath2D, DOMMatrix as CanvasDOMMatrix } from '@napi-rs/canvas';

export type RasterPage = { buffer: Buffer; mimetype: 'image/png'; pageNumber: number };

let pdfjsPromise: Promise<any> | null = null;

async function loadPdfjs(): Promise<any> {
  // pdf-parse installs its own Path2D/DOMMatrix globals; the native canvas rejects those,
  // so the @napi-rs implementations must win before pdfjs captures them.
  (globalThis as any).Path2D = CanvasPath2D;
  (globalThis as any).DOMMatrix = CanvasDOMMatrix;
  // Legacy build is the CommonJS-safe, worker-free entry point for Node.
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

export function isPdf(mimeType?: string, fileName?: string): boolean {
  return Boolean(mimeType?.toLowerCase().includes('pdf') || fileName?.toLowerCase().endsWith('.pdf'));
}

/**
 * Renders every page of a PDF to a PNG buffer so downstream OCR, storage and the
 * review UI only ever deal with images.
 */
export async function rasterizePdf(buffer: Buffer, scale = 2, maxPages = 60): Promise<RasterPage[]> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true
  });
  const doc = await loadingTask.promise;

  const pages: RasterPage[] = [];
  try {
    const pageCount = Math.min(doc.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas: canvas as any, canvasContext: context as any, viewport }).promise;
        pages.push({ buffer: canvas.toBuffer('image/png'), mimetype: 'image/png', pageNumber });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  if (pages.length === 0) throw new Error('PDF contained no renderable pages.');
  return pages;
}

/**
 * Expands any PDFs in an upload set into per-page PNGs, leaving images untouched.
 * Falls back to the original file when rendering fails so ingestion never hard-stops.
 */
export async function expandPdfFilesToImages<T extends { buffer: Buffer; mimetype?: string; originalname?: string }>(
  files: T[],
  scale = 2
): Promise<T[]> {
  const expanded: T[] = [];
  for (const file of files) {
    if (!isPdf(file.mimetype, file.originalname) || !file.buffer?.length) {
      expanded.push(file);
      continue;
    }
    try {
      const pages = await rasterizePdf(file.buffer, scale);
      const baseName = (file.originalname || 'document.pdf').replace(/\.pdf$/i, '');
      console.log(`🖼️ [PDF RASTERIZER] "${file.originalname}" → ${pages.length} page image(s).`);
      for (const page of pages) {
        expanded.push({
          ...file,
          buffer: page.buffer,
          mimetype: 'image/png',
          originalname: `${baseName}-p${page.pageNumber}.png`
        });
      }
    } catch (error: any) {
      console.warn(`⚠️ [PDF RASTERIZER] Could not render "${file.originalname}"; keeping original PDF:`, error?.stack || error?.message || error);
      expanded.push(file);
    }
  }
  return expanded;
}
