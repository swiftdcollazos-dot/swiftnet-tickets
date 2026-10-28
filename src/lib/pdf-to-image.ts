"use client";

/** Data URLs longer than this are too big to save (the server allows about 3 MB). */
const MAX_DATA_URL = 2_800_000;
/** Receipts rarely run longer; later pages are left out to keep the image readable and small. */
const MAX_PAGES = 4;

/**
 * Shrinks a large PDF by drawing its pages, one under the other, into a single compressed JPEG.
 * Returns the JPEG as a data URL, or throws if it can't be made small enough.
 */
export async function pdfToJpeg(file: File): Promise<{ dataUrl: string; pages: number; totalPages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(pdf.numPages, MAX_PAGES);

  // Try a sharper image first, then smaller and softer ones until it fits.
  for (const [width, quality] of [[1400, 0.75], [1100, 0.65], [900, 0.55], [700, 0.5]] as const) {
    const canvases: HTMLCanvasElement[] = [];
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      canvases.push(canvas);
    }
    const sheet = document.createElement("canvas");
    sheet.width = Math.max(...canvases.map((c) => c.width));
    sheet.height = canvases.reduce((h, c) => h + c.height, 0);
    const ctx = sheet.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    let y = 0;
    for (const c of canvases) {
      ctx.drawImage(c, 0, y);
      y += c.height;
    }
    const dataUrl = sheet.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_DATA_URL) return { dataUrl, pages, totalPages: pdf.numPages };
  }
  throw new Error("too big");
}
