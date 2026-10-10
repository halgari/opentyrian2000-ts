// SPDX-License-Identifier: GPL-2.0-or-later
// Data and worklet embedded in the single-file build (tools/build-single.ts).
import { DataArchive } from './archive';
import { base64ToBytes } from '../platform/storage';

type DocLike = Pick<Document, 'getElementById'>;

/** Reads the base64 gzip pak from `<script id="data" type="text/plain">`; the text is cleared after reading. */
export async function archiveFromInline(doc: DocLike): Promise<DataArchive> {
  if (typeof (globalThis as { DecompressionStream?: unknown }).DecompressionStream === 'undefined') {
    throw new Error('This browser has no DecompressionStream, which the embedded game data needs. Use a current Chrome, Edge, Firefox or Safari 16.4 or newer.');
  }
  const el = doc.getElementById('data');
  const text = el?.textContent;
  if (!el || !text) throw new Error('The embedded game data is missing from this file; rebuild it with "pnpm build:single".');
  el.textContent = '';
  const bytes = base64ToBytes(text); // atob ignores ASCII whitespace, so no trim copy is needed
  if (!bytes) throw new Error('The embedded game data is damaged (bad base64); rebuild it with "pnpm build:single".');
  return DataArchive.fromPakBytes(bytes);
}

/** Blob URL of the worklet source in `<script id="worklet" type="text/plain">`. */
export function workletUrlFromInline(doc: DocLike): string {
  const el = doc.getElementById('worklet');
  const src = el?.textContent;
  if (!src) throw new Error('The embedded audio worklet is missing from this file');
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('This browser cannot create Blob URLs, which the embedded audio worklet needs');
  }
  return URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
}

/** data: URL of the same source, for pages where a blob: worklet module is refused (Chromium on file://). */
export function workletDataUrlFromInline(doc: DocLike): string | undefined {
  const src = doc.getElementById('worklet')?.textContent;
  if (!src) return undefined;
  // the worklet source is plain ASCII/UTF-8 text; percent-encode it rather than base64 the whole thing in a second string
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(src)}`;
}
