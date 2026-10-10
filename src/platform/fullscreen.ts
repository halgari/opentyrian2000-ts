// SPDX-License-Identifier: GPL-2.0-or-later
// Web-only: a guarded Fullscreen API. Missing (iPhone Safari), disabled or rejected requests never throw.

type FsElement = { requestFullscreen?: () => Promise<void> | void; webkitRequestFullscreen?: () => Promise<void> | void };
export type FsDocument = {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  exitFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
  documentElement: FsElement;
};

export function fullscreenSupported(doc: FsDocument): boolean {
  if (doc.fullscreenEnabled !== true && doc.webkitFullscreenEnabled !== true) return false;
  const el = doc.documentElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

export function isFullscreen(doc: FsDocument): boolean {
  return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

function swallow(call: () => Promise<void> | void): void {
  try {
    const r = call();
    if (r && typeof (r as Promise<void>).catch === 'function') void (r as Promise<void>).catch(() => {});
  } catch { /* rejected or unsupported: stay as we are */ }
}

export function toggleFullscreen(doc: FsDocument): void {
  if (!fullscreenSupported(doc)) return;
  if (isFullscreen(doc)) {
    if (typeof doc.exitFullscreen === 'function') swallow(() => doc.exitFullscreen!());
    else if (typeof doc.webkitExitFullscreen === 'function') swallow(() => doc.webkitExitFullscreen!());
  } else {
    const el = doc.documentElement;
    if (typeof el.requestFullscreen === 'function') swallow(() => el.requestFullscreen!());
    else if (typeof el.webkitRequestFullscreen === 'function') swallow(() => el.webkitRequestFullscreen!());
  }
}
