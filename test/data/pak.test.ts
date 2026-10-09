import { describe, expect, it } from 'vitest';
import { decodePak, encodePak } from '../../src/data/pak';

describe('PAK', () => {
  it('round-trips entries', () => {
    const entries = [
      { name: 'a.dat', data: new Uint8Array([1, 2, 3]) },
      { name: "newsh'.shp", data: new Uint8Array([]) },
      { name: 'b', data: new Uint8Array([9]) },
    ];
    const map = decodePak(encodePak(entries));
    expect([...map.keys()]).toEqual(['a.dat', "newsh'.shp", 'b']);
    expect(Array.from(map.get('a.dat')!)).toEqual([1, 2, 3]);
    expect(map.get("newsh'.shp")!.length).toBe(0);
  });
  it('rejects bad magic', () => {
    expect(() => decodePak(new Uint8Array([0, 1, 2, 3, 0, 0, 0, 0]))).toThrow(/bad magic/);
  });
  it('rejects truncated packs', () => {
    const bytes = encodePak([{ name: 'x', data: new Uint8Array(10) }]);
    expect(() => decodePak(bytes.slice(0, bytes.length - 1))).toThrow(RangeError);
  });
});
