'use client';
// Browser wiring for the two parsers that need extra assets. Not imported by tests (Node resolves these itself).
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ReadScattOptions } from './scatt';

/** Pass to readScatt() in the browser so sql.js finds its wasm. */
export const scattBrowserOptions: ReadScattOptions = {
  locateFile: () => new URL('sql.js/dist/sql-wasm.wasm', import.meta.url).toString(),
};

/** Call once before parseSiusPdf() in the browser. */
export function configurePdfWorker(): void {
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
}
