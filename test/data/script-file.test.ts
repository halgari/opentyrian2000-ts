import { describe, expect, it } from 'vitest';
import { atoi, atoiAt, cstr, cstrlen, readCube, ScriptReader, strPopInt } from '../../src/data/script-file';
import { encodeScript } from '../helpers/script';
import { describeData, testArchive } from '../helpers/data';

describe('C string helpers', () => {
  it('atoi follows libc: blanks, sign, digits, junk stops it', () => {
    expect(atoi('002[')).toBe(2);
    expect(atoi('  -17x')).toBe(-17);
    expect(atoi('+5')).toBe(5);
    expect(atoi('x5')).toBe(0);
    expect(atoi('')).toBe(0);
    expect(atoi('9999 004')).toBe(9999);
  });

  it('atoiAt past the terminator reads the stale bytes of the buffer, like the C', () => {
    const buf = new Uint8Array(16);
    buf.set([0x31, 0x32, 0, 0x37, 0x38]); // "12\0" then stale "78"
    expect(atoiAt(buf, 0)).toBe(12);
    expect(atoiAt(buf, 3)).toBe(78);
    expect(cstrlen(buf)).toBe(2);
    expect(cstr(buf, 3)).toBe('78');
  });

  it('strPopInt pops leading integers (str_pop_int)', () => {
    expect(strPopInt(' 1 2 3')).toEqual({ value: 1, rest: ' 2 3' });
    expect(strPopInt('  -4')).toEqual({ value: -4, rest: '' });
    expect(strPopInt('')).toBeNull();
    expect(strPopInt(' x')).toBeNull();
  });
});

describe('ScriptReader', () => {
  it('round-trips encrypted Pascal strings', () => {
    const lines = ['*1 SECTION', ']L[ 9999 004 TYRIAN   18 09', '', 'a'];
    const r = new ScriptReader(encodeScript(lines));
    expect(lines.map(() => r.readString())).toEqual(lines);
    expect(() => r.readString()).toThrow(RangeError); // fread_u8_die at EOF
  });

  it('truncates to the destination size (assert(len < size) is compiled out)', () => {
    const r = new ScriptReader(encodeScript(['abcdefgh']));
    expect(r.readString(5)).toBe('abcd');
  });

  it('skip() steps over one string', () => {
    const r = new ScriptReader(encodeScript(['one', 'two']));
    r.skip();
    expect(r.readString()).toBe('two');
  });
});

describeData('shipped data files', () => {
  const LINES = [481, 277, 311, 683, 184];
  const SECTIONS = [48, 24, 25, 51, 20];

  it.each([1, 2, 3, 4, 5])('levels%i.dat decodes to the measured line and section counts', (ep) => {
    const r = new ScriptReader(testArchive!.get(`levels${ep}.dat`));
    let lines = 0;
    let sections = 0;
    while (r.pos < r.bytes.length) {
      if (r.readString().startsWith('*')) sections++;
      lines++;
    }
    expect(lines).toBe(LINES[ep - 1]);
    expect(sections).toBe(SECTIONS[ep - 1]);
  });

  it('cubetxt files hold readable cubes', () => {
    for (let ep = 1; ep <= 5; ep++) {
      const bytes = testArchive!.get(`cubetxt${ep}.dat`);
      let n = 0;
      const r = new ScriptReader(bytes);
      while (r.pos < bytes.length) if (r.readString().startsWith('*')) n++;
      expect(n).toBeGreaterThan(0);
      // cube k = lines after the k-th `*`; the last `*` closes the final cube, so n-1 cubes... read all but the last
      for (let k = 1; k < n; k++) {
        const cube = readCube(bytes, k);
        expect(cube.title.length).toBeGreaterThan(0);
        expect(cube.faceSprite).toBeGreaterThanOrEqual(-1); // `*03` has no face number: strtol gives 0, then --
      }
    }
  });

  it('readCube parses the face number, title, header and body of cube 2 of episode 1', () => {
    const cube = readCube(testArchive!.get('cubetxt1.dat'), 2);
    expect(cube.faceSprite).toBe(1); // "*02 02" -> 2 - 1
    expect(cube.body.length).toBeGreaterThan(5);
  });

  it('readCube rejects cube_index 0', () => {
    expect(() => readCube(testArchive!.get('cubetxt1.dat'), 0)).toThrow(RangeError);
  });
});
