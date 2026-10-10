// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { fullscreenSupported, isFullscreen, toggleFullscreen, type FsDocument } from '../../src/platform/fullscreen';
import { licenceNotice } from '../../src/licence';

describe('guarded Fullscreen API', () => {
  it('a document without the API is unsupported, not fullscreen, and toggling does not throw', () => {
    const doc: FsDocument = { documentElement: {} }; // iPhone Safari: no requestFullscreen, fullscreenElement undefined
    expect(fullscreenSupported(doc)).toBe(false);
    expect(isFullscreen(doc)).toBe(false);
    expect(() => toggleFullscreen(doc)).not.toThrow();
  });
  it('fullscreenEnabled false disables it even when the method exists', () => {
    const request = vi.fn();
    const doc: FsDocument = { fullscreenEnabled: false, documentElement: { requestFullscreen: request } };
    expect(fullscreenSupported(doc)).toBe(false);
    toggleFullscreen(doc);
    expect(request).not.toHaveBeenCalled();
  });
  it('requests, exits, and swallows rejections and synchronous throws', () => {
    const request = vi.fn(() => Promise.reject(new Error('no user activation')));
    const doc: FsDocument = { fullscreenEnabled: true, fullscreenElement: null, documentElement: { requestFullscreen: request }, exitFullscreen: () => { throw new Error('x'); } };
    expect(isFullscreen(doc)).toBe(false);
    toggleFullscreen(doc);
    expect(request).toHaveBeenCalledTimes(1);
    doc.fullscreenElement = {};
    expect(isFullscreen(doc)).toBe(true);
    expect(() => toggleFullscreen(doc)).not.toThrow();
  });
  it('uses the webkit-prefixed request where that is all there is', () => {
    const request = vi.fn();
    const doc: FsDocument = { webkitFullscreenEnabled: true, documentElement: { webkitRequestFullscreen: request } };
    expect(fullscreenSupported(doc)).toBe(true);
    toggleFullscreen(doc);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('licence notice', () => {
  it('states GPL-2.0, upstream, and the data caveat; the source URL is configurable', () => {
    const none = licenceNotice(undefined);
    expect(none).toContain('Source code: GPL-2.0 (source URL not configured)');
    expect(licenceNotice('https://example.org/src')).toContain('Source code: GPL-2.0, https://example.org/src');
    for (const t of [none, licenceNotice('')]) {
      expect(t).toContain('https://github.com/KScl/opentyrian2000');
      expect(t).toContain('All Rights Reserved');
      expect(t).toContain('freeware');
    }
  });
});
