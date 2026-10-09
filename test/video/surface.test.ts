import { describe, expect, it } from 'vitest';
import { clearSurface, copySurface, createSurface, fillRect } from '../../src/video/surface';

describe('Surface', () => {
  it('creates a zeroed 320x200 surface', () => {
    const s = createSurface();
    expect([s.w, s.h, s.pitch, s.pixels.length]).toEqual([320, 200, 320, 64000]);
  });
  it('copy and clear', () => {
    const a = createSurface(); const b = createSurface();
    a.pixels[123] = 5;
    copySurface(b, a);
    expect(b.pixels[123]).toBe(5);
    clearSurface(b);
    expect(b.pixels[123]).toBe(0);
  });
  it('fillRect clips like SDL_FillRect', () => {
    const s = createSurface();
    fillRect(s, -2, -2, 4, 4, 7);         // only (0..1, 0..1) inside
    expect(s.pixels[0]).toBe(7);
    expect(s.pixels[1]).toBe(7);
    expect(s.pixels[2]).toBe(0);
    expect(s.pixels[320 + 1]).toBe(7);
    expect(s.pixels[640]).toBe(0);
    fillRect(s, 318, 199, 10, 10, 9);     // bottom-right corner, no wrap
    expect(s.pixels[63998]).toBe(9);
    expect(s.pixels[63999]).toBe(9);
    fillRect(s, 10, 10, 0, 5, 3);         // empty
    expect(s.pixels[10 * 320 + 10]).toBe(0);
  });
});
