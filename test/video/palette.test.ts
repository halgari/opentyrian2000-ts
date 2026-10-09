import { describe, expect, it } from 'vitest';
import { loadPalettes } from '../../src/data/palette-file';
import { PaletteState, initStepFadePalette, stepFadePalette } from '../../src/video/palette';
import { describeData, testArchive } from '../helpers/data';

describe('palette-file', () => {
  it('expands 6-bit VGA components with (c<<2)|(c>>4)', () => {
    const bytes = new Uint8Array(768 * 24);
    bytes[0] = 63; bytes[1] = 32; bytes[2] = 1;
    const p = loadPalettes(bytes);
    expect(p).toHaveLength(24);
    expect([p[0]![0], p[0]![1], p[0]![2]]).toEqual([255, 130, 4]);
  });
  it('rejects the wrong size', () => {
    expect(() => loadPalettes(new Uint8Array(768 * 23))).toThrow(/24 palettes/);
  });
});

describe('fade steps (port of step_fade_palette)', () => {
  it('reaches the target with C-truncating integer steps', () => {
    const ps = new PaletteState([]);
    const target = new Uint8Array(768);
    target[0] = 255; target[1] = 10; target[2] = 0;
    ps.current[2] = 100;
    const diff = new Int32Array(768);
    initStepFadePalette(ps, diff, target, 0, 0);
    const seen: number[][] = [];
    for (let steps = 10; steps > 0; steps--) {
      stepFadePalette(ps, diff, steps, 0, 0);
      seen.push([ps.current[0]!, ps.current[1]!, ps.current[2]!]);
    }
    expect(seen[0]).toEqual([25, 1, 90]);   // 255/10=25, 10/10=1, -100/10=-10
    expect(seen[9]).toEqual([255, 10, 0]);
  });
  it('setColors / setPalette bump version', () => {
    const ps = new PaletteState([]);
    const v = ps.version;
    ps.setColors(1, 2, 3, 5, 6);
    expect(ps.version).toBeGreaterThan(v);
    expect(Array.from(ps.current.subarray(15, 21))).toEqual([1, 2, 3, 1, 2, 3]);
  });
});

describeData('real palette.dat', () => {
  it('loads 24 palettes', () => {
    expect(loadPalettes(testArchive!.get('palette.dat'))).toHaveLength(24);
  });
});
