// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { canvasBox } from '../../src/platform/scaling';

describe('canvasBox', () => {
  it('fit-4-3 reproduces the stylesheet rule', () => {
    expect(canvasBox('fit-4-3', 1600, 900)).toEqual({ w: 1200, h: 900 });
    expect(canvasBox('fit-4-3', 800, 900)).toEqual({ w: 800, h: 600 });
  });
  it('fit-8-5 keeps 320x200', () => {
    expect(canvasBox('fit-8-5', 1600, 900)).toEqual({ w: 1440, h: 900 });
    expect(canvasBox('fit-8-5', 800, 900)).toEqual({ w: 800, h: 500 });
  });
  it('integer picks the largest whole multiple, never below 1x', () => {
    expect(canvasBox('integer', 1920, 1080)).toEqual({ w: 1600, h: 1000 }); // 5x fits; 6x = 1920x1200 does not fit the height
    expect(canvasBox('integer', 100, 100)).toEqual({ w: 320, h: 200 });
  });
  it.each([[1, 5], [1.25, 6], [1.5, 8], [2, 10]])('integer at devicePixelRatio %s is %sx in device pixels', (dpr, k) => {
    const { w, h } = canvasBox('integer', 1920, 1080, dpr);
    expect(w * dpr).toBeCloseTo(320 * k, 9);
    expect(h * dpr).toBeCloseTo(200 * k, 9);
  });
  it('integer never drops below 1x device pixel, even in a tiny window', () => {
    expect(canvasBox('integer', 100, 100, 2)).toEqual({ w: 160, h: 100 });
  });
});
