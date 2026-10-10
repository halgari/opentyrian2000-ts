// SPDX-License-Identifier: GPL-2.0-or-later
// Web-only: how the 320x200 canvas fills the browser window (the C's Scaling Mode setting, video.c, minus Center).

export type ScalingMode = 'fit-4-3' | 'fit-8-5' | 'integer';

export const SCALING_MODES: readonly ScalingMode[] = ['fit-4-3', 'fit-8-5', 'integer'];

export function isScalingMode(v: unknown): v is ScalingMode {
  return typeof v === 'string' && (SCALING_MODES as readonly string[]).includes(v);
}

/** The CSS pixel size of the canvas for a viewport (`dpr` = devicePixelRatio; only Integer mode depends on it). `fit-4-3` is the page's original stylesheet rule. */
export function canvasBox(mode: ScalingMode, viewW: number, viewH: number, dpr = 1): { w: number; h: number } {
  switch (mode) {
    case 'fit-4-3':
      return { w: Math.floor(Math.min(viewW, (viewH * 4) / 3)), h: Math.floor(Math.min(viewH, (viewW * 3) / 4)) };
    case 'fit-8-5':
      return { w: Math.floor(Math.min(viewW, (viewH * 8) / 5)), h: Math.floor(Math.min(viewH, (viewW * 5) / 8)) };
    case 'integer': {
      // whole multiple in DEVICE pixels, expressed back in CSS pixels
      const r = dpr > 0 ? dpr : 1;
      const k = Math.max(1, Math.min(Math.floor((viewW * r) / 320), Math.floor((viewH * r) / 200)));
      return { w: (320 * k) / r, h: (200 * k) / r };
    }
  }
}
