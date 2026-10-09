# Foundation (Sub-project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser TypeScript port of OpenTyrian2000's startup path — data loading, 8-bit
framebuffer + palette, sprites, fonts, async frame timing, input — that renders the intro
logos, title screen and main menu pixel-identical to the original C program.

**Architecture:** C blocking loops become `async` functions that `await` a pluggable
`Clock` (real in the browser, virtual in tests). All state lives in an explicit `Ctx`.
Drawing ports write into `Uint8Array` 320×200 indexed surfaces exactly as the C does;
a presenter maps them through the current palette onto a canvas. A patched build of the
original C ("oracle") dumps every presented frame so golden tests can compare
frame-by-frame.

**Tech Stack:** pnpm, TypeScript (strict), Vite, vitest, tsx (tool scripts), fflate
(tooling only). Node ≥ 22. System gcc + SDL2 for the oracle.

**Spec:** `docs/superpowers/specs/2026-10-09-foundation-design.md`

## Global Constraints

- Upstream source of truth: `https://github.com/KScl/opentyrian2000` commit
  `aad5aca01af139c0b089237c38ef765f7a84355d`, cloned (gitignored) to
  `reference/opentyrian2000/` by Task 1. **When a task says "port X", open the C in
  `reference/opentyrian2000/src/` and port it line by line**; the code in this plan is
  that port already done — if the two disagree, the C wins and you note it in the commit.
- Behaviour-exact: same integer math (C truncating division → `Math.trunc`, byte stores
  wrap via `Uint8Array`), same draw order, same number of `showVGA` calls.
- No DOS emulation; platform plumbing is re-implemented, not emulated.
- No module-level mutable state in `src/` — all mutable state hangs off `Ctx` or objects
  passed in. (Constant tables are fine.)
- Every ported file starts with this header (fill in the C file name):
  ```ts
  // OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
  // Copyright (C) 2007-2009 The OpenTyrian Development Team
  // Copyright (C) 2022 Kaito Sinclaire
  // Copyright (C) 2026 OpenTyrian2000-TS contributors
  // SPDX-License-Identifier: GPL-2.0-or-later
  // Ported from: src/<file>.c
  ```
  Non-ported new files use only the SPDX line.
- Each ported function has a comment naming its C original, e.g. `// port of JE_loadPic`.
- Game text is a JS string where each char code is the raw byte (latin1). Never use
  `TextDecoder('utf-8')` on game data.
- Never commit game data or derived output: `data/`, `public/data/`, `reference/`,
  `test-data/`, `test-output/`, `dist/`, `node_modules/` are gitignored.
- Tests needing game data / oracle output must `skip` (not fail) when it is absent.
- Commit after every task; message style `feat: …` / `test: …` / `chore: …`; end every
  commit message with the line
  `Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz`.
- Imports inside `src/` are extensionless relative paths (`'../core/int'`).

## Review Focus

1. **Game data missing or not a Tyrian 2000 PAK** → the page shows a readable error
   naming the problem and how to fix it (`pnpm data`), never a blank canvas.
   Pinned by: Task 3 `decodePak` bad-magic test, Task 13 `formatBootError` test.
2. **Mouse outside the 320×200 area / in the letterbox** (negative or ≥320 coords) →
   cursor grab/restore and clipped blits never throw or write out of range.
   Pinned by: Task 12 `mouseStartFilter` out-of-range test.
3. **Holding a key (OS auto-repeat)** → behaves like SDL2: repeated keydowns are
   delivered (menu cursor keeps moving). Pinned by: Task 13 dom-input repeat test.
4. **Browser default actions** (Space/arrows scroll the page, Tab moves focus,
   right-click opens a menu) must not happen while playing; Alt+Enter / F11 toggle
   fullscreen and are not delivered to the game. Pinned by: Task 13 dom-input tests.
5. **Window loses focus while a key is held** (Alt-Tab) → the key must not stay "stuck"
   down; release all held keys on blur like SDL does. Pinned by: Task 13 blur test.

---

## Execution waves (for parallel subagents)

Tasks within a wave touch disjoint files and may run in parallel; each wave depends on
the previous ones.

| Wave | Tasks |
|---|---|
| A | 1 |
| B | 2, 3, 4, 11 |
| C | 5 |
| D | 6, 7, 8, 10 |
| E | 9 |
| F | 12 |
| G | 13 |
| H | 14 |
| I | 15 |

Before Wave D, run `pnpm data` (Task 3) so data tests execute instead of skipping.
Before Wave H, run `pnpm oracle` (Task 4).

---

### Task 1: Project scaffold + reference source

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml` (not needed — skip), `tsconfig.json`,
  `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `COPYING`, `README.md`,
  `index.html`, `src/main.ts`, `src/version.ts`, `tools/fetch-reference.sh`,
  `test/sanity.test.ts`

**Interfaces:**
- Produces: scripts `pnpm dev | build | preview | test | typecheck | ref`;
  `src/version.ts` exports `VERSION: string`.

- [ ] **Step 1: Initialise package and deps**

```bash
cd /home/tbaldrid/oss/opentyrain2000-ts
pnpm init
pnpm add -D typescript vite vitest tsx fflate @types/node
```

If pnpm reports ignored build scripts (esbuild), run `pnpm approve-builds` and approve
`esbuild`.

Then edit `package.json` to contain (keep the dependency versions pnpm wrote):

```json
{
  "name": "opentyrian2000-ts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "GPL-2.0-or-later",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "ref": "bash tools/fetch-reference.sh"
  }
}
```

- [ ] **Step 2: Config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": false,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test", "tools", "vite.config.ts", "vitest.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
```

`.gitignore`:
```
node_modules/
dist/
data/
public/data/
reference/
test-data/
test-output/
*.log
```

- [ ] **Step 3: Licence, readme, version, page shell**

```bash
curl -sSfL https://raw.githubusercontent.com/KScl/opentyrian2000/aad5aca01af139c0b089237c38ef765f7a84355d/COPYING -o COPYING
head -3 COPYING   # expect "GNU GENERAL PUBLIC LICENSE" / "Version 2, June 1991"
```

`src/version.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
export const VERSION = 'ts-0.1.0';
```

`README.md`:
```markdown
# OpenTyrian2000-TS

A TypeScript/browser port of [OpenTyrian2000](https://github.com/KScl/opentyrian2000),
itself a port of the DOS shoot-'em-up Tyrian 2000. Goal: behaviour-exact, playable in a
browser.

## Setup

    pnpm install
    pnpm data ~/Downloads/tyrian2000.zip   # unpack the freeware game data (not in git)
    pnpm dev

`tyrian2000.zip` is the freeware Tyrian 2000 data release
(https://www.camanis.net/tyrian/tyrian2000.zip).

## Tests

    pnpm test             # unit tests; data tests run if `pnpm data` was run
    pnpm oracle           # build the patched C original and record golden frames
    pnpm test             # now also runs the golden frame comparisons

## Credits & licence

Code: GPL-2.0-or-later (see COPYING). Ported from OpenTyrian (© The OpenTyrian
Development Team) and OpenTyrian2000 (© Kaito Sinclaire). Tyrian © Jason Emery / Eclipse
Software; art by Daniel Cook; music by Alexander Brandon. Tyrian 2000 data was released
as freeware in 2004 and is not included in this repository.
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenTyrian2000</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; color: #ccc; overflow: hidden;
        font-family: system-ui, sans-serif; }
      #stage { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
      #screen { width: min(100vw, calc(100vh * 4 / 3)); height: min(100vh, calc(100vw * 3 / 4));
        image-rendering: pixelated; image-rendering: crisp-edges; cursor: none; background: #000; }
      #overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        text-align: center; padding: 16px; background: rgba(0,0,0,.85); font-size: 18px; white-space: pre-line; }
      #overlay[hidden] { display: none; }
    </style>
  </head>
  <body>
    <div id="stage"><canvas id="screen" width="320" height="200"></canvas></div>
    <div id="overlay">Loading…</div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts` (temporary; replaced in Task 13):
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { VERSION } from './version';

document.getElementById('overlay')!.textContent = `OpenTyrian2000-TS ${VERSION}`;
```

- [ ] **Step 4: Reference source fetch script**

`tools/fetch-reference.sh`:
```bash
#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Clones the pinned upstream C source to reference/opentyrian2000 (read-only reference).
set -euo pipefail
COMMIT=aad5aca01af139c0b089237c38ef765f7a84355d
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/reference/opentyrian2000"
if [ ! -d "$DIR/.git" ]; then
  git clone --quiet https://github.com/KScl/opentyrian2000.git "$DIR"
fi
git -C "$DIR" checkout --quiet "$COMMIT"
echo "reference source at $DIR ($COMMIT)"
```

Run: `pnpm ref` — Expected: `reference source at …/reference/opentyrian2000 (aad5aca…)`.

- [ ] **Step 5: Sanity test**

`test/sanity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version';

describe('scaffold', () => {
  it('exposes a version string', () => {
    expect(VERSION).toMatch(/^ts-/);
  });
});
```

Run: `pnpm test` → PASS (1 test). Run: `pnpm typecheck` → no errors.
Run: `pnpm build` → `dist/index.html` exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm/vite/vitest project

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 2: Core — integer helpers, BinaryReader, Mersenne Twister

**Files:**
- Create: `src/core/int.ts`, `src/core/binary-reader.ts`, `src/core/mtrand.ts`
- Test: `test/core/int.test.ts`, `test/core/binary-reader.test.ts`, `test/core/mtrand.test.ts`

**Interfaces:**
- Produces:
  - `int.ts`: `u8(x)`, `s8(x)`, `u16(x)`, `s16(x)`, `u32(x)`, `s32(x)`, `idiv(a, b)` — all `(number) => number`.
  - `binary-reader.ts`: `class BinaryReader { constructor(data: Uint8Array, pos?: number); pos: number; readonly length: number; u8(); s8(); bool(); u16(); s16(); u32(); s32(); bytes(n): Uint8Array; seek(pos): void; skip(n): void; eof(): boolean }` — reads little-endian, throws `RangeError` when reading past the end.
  - `mtrand.ts`: `MT_RAND_MAX = 0xffffffff`; `class MersenneTwister { srand(seed: number): void; rand(): number; rand1(): number; randLt1(): number }`.

- [ ] **Step 1: Write failing tests**

`test/core/int.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { idiv, s16, s32, s8, u16, u32, u8 } from '../../src/core/int';

describe('int helpers', () => {
  it('wraps like C fixed-width types', () => {
    expect(u8(256 + 5)).toBe(5);
    expect(u8(-1)).toBe(255);
    expect(s8(255)).toBe(-1);
    expect(s8(128)).toBe(-128);
    expect(u16(-1)).toBe(65535);
    expect(s16(0x8000)).toBe(-32768);
    expect(u32(-1)).toBe(4294967295);
    expect(s32(0xffffffff)).toBe(-1);
  });
  it('idiv truncates toward zero like C', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
    expect(idiv(7, -2)).toBe(-3);
  });
});
```

`test/core/binary-reader.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BinaryReader } from '../../src/core/binary-reader';

describe('BinaryReader', () => {
  const data = new Uint8Array([0x01, 0xff, 0x34, 0x12, 0xfe, 0xff, 0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff]);
  it('reads little-endian ints', () => {
    const r = new BinaryReader(data);
    expect(r.u8()).toBe(1);
    expect(r.s8()).toBe(-1);
    expect(r.u16()).toBe(0x1234);
    expect(r.s16()).toBe(-2);
    expect(r.u32()).toBe(0x12345678);
    expect(r.s32()).toBe(-1);
    expect(r.eof()).toBe(true);
  });
  it('bool is any non-zero byte', () => {
    const r = new BinaryReader(new Uint8Array([0, 2]));
    expect(r.bool()).toBe(false);
    expect(r.bool()).toBe(true);
  });
  it('bytes/seek/skip', () => {
    const r = new BinaryReader(data);
    r.skip(2);
    expect(Array.from(r.bytes(2))).toEqual([0x34, 0x12]);
    r.seek(0);
    expect(r.pos).toBe(0);
    expect(r.length).toBe(14);
  });
  it('throws RangeError past the end', () => {
    const r = new BinaryReader(new Uint8Array([1]));
    expect(() => r.u16()).toThrow(RangeError);
    expect(() => new BinaryReader(new Uint8Array(2)).bytes(3)).toThrow(RangeError);
  });
});
```

`test/core/mtrand.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MersenneTwister } from '../../src/core/mtrand';

describe('MersenneTwister (port of mtrand.c)', () => {
  it('uses default seed 5489 when never seeded', () => {
    const mt = new MersenneTwister();
    expect([mt.rand(), mt.rand(), mt.rand(), mt.rand(), mt.rand()]).toEqual([
      3499211612, 581869302, 3890346734, 3586334585, 545404204,
    ]);
  });
  it('matches reference outputs for seed 1', () => {
    const mt = new MersenneTwister();
    mt.srand(1);
    expect([mt.rand(), mt.rand(), mt.rand()]).toEqual([1791095845, 4282876139, 3093770124]);
  });
  it('wraps its state pointers past 624 outputs', () => {
    const mt = new MersenneTwister();
    mt.srand(5489);
    let last = 0;
    for (let i = 0; i < 10000; i++) last = mt.rand();
    expect(last).toBe(4123659995); // 10000th output of MT19937 default seed
  });
  it('rand1 / randLt1 are float32 in range', () => {
    const mt = new MersenneTwister();
    mt.srand(7);
    for (let i = 0; i < 1000; i++) {
      const a = mt.rand1();
      const b = mt.randLt1();
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(b).toBeLessThan(1);
      expect(Math.fround(a)).toBe(a);
    }
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test test/core` — Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/core/int.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// C fixed-width integer semantics.
export const u8 = (x: number): number => x & 0xff;
export const s8 = (x: number): number => (x << 24) >> 24;
export const u16 = (x: number): number => x & 0xffff;
export const s16 = (x: number): number => (x << 16) >> 16;
export const u32 = (x: number): number => x >>> 0;
export const s32 = (x: number): number => x | 0;
/** C integer division (truncates toward zero). */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);
```

`src/core/binary-reader.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Replaces the fread_*_die helpers of file.h: little-endian reads over an in-memory file.
export class BinaryReader {
  pos: number;
  readonly length: number;
  private readonly view: DataView;

  constructor(readonly data: Uint8Array, pos = 0) {
    this.pos = pos;
    this.length = data.length;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  private need(n: number): number {
    const p = this.pos;
    if (p < 0 || p + n > this.length) throw new RangeError(`read past end (${p}+${n} > ${this.length})`);
    this.pos = p + n;
    return p;
  }

  u8(): number { return this.view.getUint8(this.need(1)); }
  s8(): number { return this.view.getInt8(this.need(1)); }
  bool(): boolean { return this.u8() !== 0; }
  u16(): number { return this.view.getUint16(this.need(2), true); }
  s16(): number { return this.view.getInt16(this.need(2), true); }
  u32(): number { return this.view.getUint32(this.need(4), true); }
  s32(): number { return this.view.getInt32(this.need(4), true); }
  bytes(n: number): Uint8Array { const p = this.need(n); return this.data.slice(p, p + n); }
  seek(pos: number): void { this.pos = pos; }
  skip(n: number): void { this.need(n); }
  eof(): boolean { return this.pos >= this.length; }
}
```

`src/core/mtrand.ts` (port of `mtrand.c`; add the full GPL header + keep the original
BSD notice from mtrand.c as a comment block — copy it from the C file):
```ts
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

export const MT_RAND_MAX = 0xffffffff;

export class MersenneTwister {
  private readonly x = new Uint32Array(N);
  private p0 = -1; // -1 = never seeded (C: p0 == NULL)
  private p1 = 0;
  private pm = 0;

  // port of mt_srand
  srand(seed: number): void {
    const x = this.x;
    x[0] = seed >>> 0;
    for (let i = 1; i < N; ++i) {
      const prev = x[i - 1]!;
      x[i] = (Math.imul(1812433253, (prev ^ (prev >>> 30)) >>> 0) + i) >>> 0;
    }
    this.p0 = 0;
    this.p1 = 1;
    this.pm = M;
  }

  // port of mt_rand
  rand(): number {
    if (this.p0 < 0) this.srand(5489);
    const x = this.x;
    const a = x[this.p0]!;
    const b = x[this.p1]!;
    let y = (x[this.pm++]! ^ (((a & UPPER_MASK) | (b & LOWER_MASK)) >>> 1) ^ (b & 1 ? MATRIX_A : 0)) >>> 0;
    x[this.p0] = y;
    this.p0 = this.p1++;
    if (this.pm === N) this.pm = 0;
    if (this.p1 === N) this.p1 = 0;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  // port of mt_rand_1: float32 math, [0,1]
  rand1(): number {
    return Math.fround(Math.fround(this.rand()) / Math.fround(MT_RAND_MAX));
  }

  // port of mt_rand_lt1: float32 math, [0,1)
  randLt1(): number {
    return Math.fround(Math.fround(this.rand()) / Math.fround(Math.fround(MT_RAND_MAX) + 1));
  }
}
```

Note on `randLt1`: in float32, `MT_RAND_MAX` rounds to 4294967296, so `rand()` of
`0xffffffff` yields exactly 1.0 — this is the C behaviour too; keep it. Adjust the test's
`toBeLessThan(1)` to `toBeLessThanOrEqual(1)` only if a seed-7 draw actually hits it
(it does not in 1000 draws; leave as is unless it fails).

- [ ] **Step 4: Run tests**

Run: `pnpm test test/core` — Expected: PASS. If the 10000th-output assertion fails,
verify the constant by running the C reference:
`printf '#include "mtrand.h"\n#include <stdio.h>\nint main(){unsigned long v=0;mt_srand(5489);for(int i=0;i<10000;i++)v=mt_rand();printf("%%lu\\n",v);}' > /tmp/mt.c && gcc -Ireference/opentyrian2000/src /tmp/mt.c reference/opentyrian2000/src/mtrand.c -o /tmp/mt && /tmp/mt`
and use the C value (the C is the oracle).

- [ ] **Step 5: Commit**

```bash
git add src/core test/core
git commit -m "feat: core int helpers, BinaryReader, Mersenne Twister port

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 3: Data packing (PAK), DataArchive, `pnpm data`

**Files:**
- Create: `src/data/pak.ts`, `src/data/archive.ts`, `tools/pack-data.ts`, `test/helpers/data.ts`
- Modify: `package.json` (add script `"data": "tsx tools/pack-data.ts"`)
- Test: `test/data/pak.test.ts`, `test/data/archive.test.ts`

**Interfaces:**
- Consumes: nothing (standalone).
- Produces:
  - `pak.ts`: `interface PakEntry { name: string; data: Uint8Array }`;
    `encodePak(entries: PakEntry[]): Uint8Array`; `decodePak(bytes: Uint8Array): Map<string, Uint8Array>` (throws `Error('not a Tyrian data pack (bad magic)')`).
  - `archive.ts`: `class DataArchive { constructor(files: Map<string, Uint8Array>); get(name: string): Uint8Array; has(name: string): boolean; names(): string[]; static fromPakBytes(bytes: Uint8Array): Promise<DataArchive> }`;
    `fetchArchive(url: string, onProgress?: (loaded: number, total: number) => void): Promise<DataArchive>`;
    `DATA_URL = 'data/tyrian2000.t2kpak'`.
  - `test/helpers/data.ts`: `testArchive: DataArchive | null`; `describeData` (= `describe` or `describe.skip`).
  - Files on disk after `pnpm data`: `data/tyrian2000/<lowercase names>` and `public/data/tyrian2000.t2kpak` (gzip of PAK).

PAK format (little-endian): `"T2KP"` | `u32 count` | count × (`u8 nameLen`, name ASCII, `u32 size`) | bodies concatenated in entry order.

- [ ] **Step 1: Failing tests**

`test/data/pak.test.ts`:
```ts
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
```

`test/data/archive.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import { DataArchive } from '../../src/data/archive';
import { encodePak } from '../../src/data/pak';

describe('DataArchive', () => {
  const pak = encodePak([{ name: 'tyrian.pic', data: new Uint8Array([7]) }]);
  it('is case-insensitive and throws a clear error on missing files', () => {
    const a = new DataArchive(new Map([['tyrian.pic', new Uint8Array([7])]]));
    expect(a.get('TYRIAN.PIC')[0]).toBe(7);
    expect(a.has('Tyrian.Pic')).toBe(true);
    expect(() => a.get('nope.dat')).toThrow('missing data file: nope.dat');
  });
  it('fromPakBytes accepts raw and gzip-compressed packs', async () => {
    expect((await DataArchive.fromPakBytes(pak)).get('tyrian.pic')[0]).toBe(7);
    expect((await DataArchive.fromPakBytes(gzipSync(pak))).get('tyrian.pic')[0]).toBe(7);
  });
});
```

Run: `pnpm test test/data` — Expected: FAIL (modules missing).

- [ ] **Step 2: Implement `src/data/pak.ts`**

```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { BinaryReader } from '../core/binary-reader';

export interface PakEntry { name: string; data: Uint8Array }

const MAGIC = [0x54, 0x32, 0x4b, 0x50]; // "T2KP"

export function encodePak(entries: PakEntry[]): Uint8Array {
  let size = 8;
  for (const e of entries) size += 1 + e.name.length + 4 + e.data.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint32(4, entries.length, true);
  let p = 8;
  for (const e of entries) {
    if (e.name.length > 255) throw new Error(`name too long: ${e.name}`);
    out[p++] = e.name.length;
    for (let i = 0; i < e.name.length; i++) out[p++] = e.name.charCodeAt(i) & 0xff;
    view.setUint32(p, e.data.length, true);
    p += 4;
  }
  for (const e of entries) {
    out.set(e.data, p);
    p += e.data.length;
  }
  return out;
}

export function decodePak(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length < 8 || MAGIC.some((m, i) => bytes[i] !== m)) {
    throw new Error('not a Tyrian data pack (bad magic)');
  }
  const r = new BinaryReader(bytes, 4);
  const count = r.u32();
  const heads: { name: string; size: number }[] = [];
  for (let i = 0; i < count; i++) {
    const len = r.u8();
    const name = String.fromCharCode(...r.bytes(len));
    heads.push({ name, size: r.u32() });
  }
  const files = new Map<string, Uint8Array>();
  for (const h of heads) files.set(h.name, r.bytes(h.size));
  return files;
}
```

- [ ] **Step 3: Implement `src/data/archive.ts`**

```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { decodePak } from './pak';

export const DATA_URL = 'data/tyrian2000.t2kpak';

export class DataArchive {
  private readonly files = new Map<string, Uint8Array>();

  constructor(files: Map<string, Uint8Array>) {
    for (const [k, v] of files) this.files.set(k.toLowerCase(), v);
  }

  get(name: string): Uint8Array {
    const f = this.files.get(name.toLowerCase());
    if (!f) throw new Error(`missing data file: ${name}`);
    return f;
  }

  has(name: string): boolean {
    return this.files.has(name.toLowerCase());
  }

  names(): string[] {
    return [...this.files.keys()];
  }

  /** Accepts a PAK, optionally gzip-compressed (detected by the 1f 8b magic). */
  static async fromPakBytes(bytes: Uint8Array): Promise<DataArchive> {
    let raw = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      raw = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return new DataArchive(decodePak(raw));
  }
}

export async function fetchArchive(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<DataArchive> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download game data from ${url} (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let p = 0;
  for (const c of chunks) { bytes.set(c, p); p += c.length; }
  return DataArchive.fromPakBytes(bytes);
}
```

Run: `pnpm test test/data` — Expected: PASS.

- [ ] **Step 4: `tools/pack-data.ts` and the script**

```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: pnpm data [path/to/tyrian2000.zip]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, unzipSync } from 'fflate';
import { encodePak, type PakEntry } from '../src/data/pak';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const zipPath = resolve(process.argv[2] ?? join(homedir(), 'Downloads', 'tyrian2000.zip'));
const EXCLUDE = /\.(exe|pif|ico|ovl)$|^setup\.box$/;

const files = unzipSync(readFileSync(zipPath));
const entries: PakEntry[] = [];
for (const [path, data] of Object.entries(files)) {
  if (path.endsWith('/')) continue;
  const name = basename(path).toLowerCase();
  if (EXCLUDE.test(name)) continue;
  entries.push({ name, data });
}
entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
if (!entries.some((e) => e.name === 'tyrian1.lvl') || !entries.some((e) => e.name === 'tyrian.hdt')) {
  console.error(`${zipPath} does not look like the Tyrian 2000 data zip (no tyrian1.lvl / tyrian.hdt)`);
  process.exit(1);
}

const dataDir = join(ROOT, 'data', 'tyrian2000');
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
for (const e of entries) writeFileSync(join(dataDir, e.name), e.data);

const pak = gzipSync(encodePak(entries), { level: 9 });
mkdirSync(join(ROOT, 'public', 'data'), { recursive: true });
writeFileSync(join(ROOT, 'public', 'data', 'tyrian2000.t2kpak'), pak);
const raw = entries.reduce((n, e) => n + e.data.length, 0);
console.log(`${entries.length} files, ${raw} bytes -> public/data/tyrian2000.t2kpak (${pak.length} bytes gzip)`);
```

Add to `package.json` scripts: `"data": "tsx tools/pack-data.ts"`.

Run: `pnpm data ~/Downloads/tyrian2000.zip`
Expected: `9x files, ~11.4 MB bytes -> public/data/tyrian2000.t2kpak (~4.6 MB gzip)`; `ls data/tyrian2000/tyrian.hdt` exists.

- [ ] **Step 5: Test data helper**

`test/helpers/data.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe } from 'vitest';
import { DataArchive } from '../../src/data/archive';

export const DATA_DIR = fileURLToPath(new URL('../../data/tyrian2000', import.meta.url));

function load(): DataArchive | null {
  if (!existsSync(join(DATA_DIR, 'tyrian.hdt'))) return null;
  const files = new Map<string, Uint8Array>();
  for (const name of readdirSync(DATA_DIR)) files.set(name, new Uint8Array(readFileSync(join(DATA_DIR, name))));
  return new DataArchive(files);
}

export const testArchive = load();
/** describe() when game data is present (run `pnpm data`), otherwise describe.skip(). */
export const describeData = testArchive ? describe : describe.skip;
```

Add to `test/data/archive.test.ts`:
```ts
import { describeData, testArchive } from '../helpers/data';

describeData('real data (pnpm data)', () => {
  it('contains the files the Foundation needs', () => {
    for (const f of ['palette.dat', 'tyrian.pic', 'tyrian.shp', 'tyrian.hdt', 'newsh1.shp']) {
      expect(testArchive!.has(f)).toBe(true);
    }
    expect(testArchive!.has('tyrian2.exe')).toBe(false);
  });
});
```

Run: `pnpm test test/data` — Expected: PASS including the data test.

- [ ] **Step 6: Commit**

```bash
git add src/data/pak.ts src/data/archive.ts tools/pack-data.ts test/helpers/data.ts test/data package.json
git commit -m "feat: data PAK format, DataArchive, pnpm data packer

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 4: Reference oracle tooling

**Files:**
- Create: `tools/oracle/dump-frames.patch` (copy of `docs/superpowers/plans/assets/dump-frames.patch`),
  `tools/oracle/build.sh`, `tools/oracle/scenarios.ts`, `tools/oracle/run.ts`,
  `test/helpers/frames.ts`, `test/helpers/png.ts`
- Modify: `package.json` scripts: `"oracle:build": "bash tools/oracle/build.sh"`,
  `"oracle:run": "tsx tools/oracle/run.ts"`, `"oracle": "pnpm oracle:build && tsx tools/oracle/run.ts all"`
- Test: `test/helpers/frames.test.ts`

**Interfaces:**
- Consumes: `data/tyrian2000/` from Task 3 (only at run time), `reference/opentyrian2000` from Task 1.
- Produces:
  - `scenarios.ts`: `interface KeyPress { frame: number; scancode: number }`;
    `interface Scenario { maxFrames: number; keys: KeyPress[] }`;
    `SCENARIOS: Record<'boot' | 'menu-nav', Scenario>`.
  - `frames.ts`: `FRAME_RECORD_SIZE = 64772`; `interface Frame { index: number; palette: Uint8Array /*768*/; pixels: Uint8Array /*64000*/ }`;
    `parseFrames(bytes: Uint8Array): Frame[]`; `readFramesFile(path: string): Frame[] | null` (null if missing);
    `ORACLE_DIR` (= `<repo>/test-data/oracle`).
  - `png.ts`: `writeIndexedPng(path: string, frame: Pick<Frame,'palette'|'pixels'>): void`;
    `writeRgbPng(path: string, w: number, h: number, rgb: Uint8Array): void`.
  - Files after `pnpm oracle`: `test-data/oracle/boot.frames`, `test-data/oracle/menu-nav.frames`.

Oracle behaviour (already verified during planning): with the patch, every
`JE_showVGA()` appends `u32 frameIndex | 768 palette bytes (8-bit RGB) | 64000 pixels`.
`OT_KEYS="f:sc,…"` injects SDL key-down+key-up for scancode `sc` right after frame `f`
is recorded. The "boot" run produces frames 0–141: 0–24 fade to white, 25–60 XSIV logo
(pic 10), 61–81 Eclipse logo (pic 12), 82–91 title fade-in, 92–120 logo slide-up,
121–140 menu fade-in, 141 idle menu. Built with `VCS_IDREV='echo oracle'` so the
version string drawn at (2,192) is `oracle`.

- [ ] **Step 1: Patch + build script**

```bash
mkdir -p tools/oracle
cp docs/superpowers/plans/assets/dump-frames.patch tools/oracle/dump-frames.patch
```

`tools/oracle/build.sh`:
```bash
#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Builds the patched C original ("oracle") into reference/oracle/opentyrian2000.
set -euo pipefail
COMMIT=aad5aca01af139c0b089237c38ef765f7a84355d
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/tools/fetch-reference.sh"
DIR="$ROOT/reference/oracle"
if [ ! -d "$DIR/.git" ]; then
  git clone --quiet "$ROOT/reference/opentyrian2000" "$DIR"
fi
git -C "$DIR" checkout --quiet --force "$COMMIT"
git -C "$DIR" clean -fdq
git -C "$DIR" apply "$ROOT/tools/oracle/dump-frames.patch"
make -C "$DIR" -j"$(nproc)" WITH_NETWORK=false VCS_IDREV='echo oracle' >/dev/null
echo "oracle built: $DIR/opentyrian2000"
```

Run: `pnpm oracle:build` — Expected: `oracle built: …/reference/oracle/opentyrian2000`.
(Requires gcc, make, pkg-config, SDL2 dev headers. SDL2_net is NOT needed.)

- [ ] **Step 2: Scenarios + runner**

`tools/oracle/scenarios.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Shared by the oracle runner and the golden tests. Scancodes are SDL scancodes.
export interface KeyPress { frame: number; scancode: number }
export interface Scenario { maxFrames: number; keys: KeyPress[] }

export const SCENARIOS = {
  /** Intro logos, title logo slide, menu fade-in, idle menu (frames 0–141). */
  boot: { maxFrames: 142, keys: [] },
  /** Down, Down, Down, Up on the main menu. */
  'menu-nav': {
    maxFrames: 146,
    keys: [
      { frame: 141, scancode: 81 },
      { frame: 142, scancode: 81 },
      { frame: 143, scancode: 81 },
      { frame: 144, scancode: 82 },
    ],
  },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;
```

`tools/oracle/run.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/run.ts <scenario|all>
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, type ScenarioName } from './scenarios';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BIN = join(ROOT, 'reference/oracle/opentyrian2000');
const DATA = join(ROOT, 'data/tyrian2000');
const OUT = join(ROOT, 'test-data/oracle');
const RECORD = 4 + 768 + 64000;

function run(name: ScenarioName): void {
  const sc = SCENARIOS[name];
  const home = join(OUT, `home-${name}`);
  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  const out = join(OUT, `${name}.frames`);
  rmSync(out, { force: true });
  const res = spawnSync(BIN, ['-t', DATA], {
    env: {
      ...process.env,
      HOME: home, XDG_CONFIG_HOME: home, XDG_DATA_HOME: home,
      SDL_VIDEODRIVER: 'dummy', SDL_AUDIODRIVER: 'dummy',
      OT_DUMP: out, OT_SEED: '1', OT_MAX_FRAMES: String(sc.maxFrames),
      OT_KEYS: sc.keys.map((k) => `${k.frame}:${k.scancode}`).join(','),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
    timeout: 180_000,
  });
  if (res.status !== 0) throw new Error(`oracle ${name} exited with ${res.status ?? res.signal}`);
  const frames = statSync(out).size / RECORD;
  if (frames !== sc.maxFrames) throw new Error(`oracle ${name}: expected ${sc.maxFrames} frames, got ${frames}`);
  console.log(`oracle ${name}: ${frames} frames -> ${out}`);
}

mkdirSync(OUT, { recursive: true });
const arg = process.argv[2] ?? 'all';
const names = arg === 'all' ? (Object.keys(SCENARIOS) as ScenarioName[]) : [arg as ScenarioName];
for (const n of names) {
  if (!(n in SCENARIOS)) throw new Error(`unknown scenario ${n}`);
  run(n);
}
```

Add the three `oracle*` scripts to `package.json`.

Run: `pnpm oracle` — Expected (≈20 s total):
```
oracle boot: 142 frames -> …/test-data/oracle/boot.frames
oracle menu-nav: 146 frames -> …/test-data/oracle/menu-nav.frames
```

- [ ] **Step 3: Frame reader + PNG writer (failing test first)**

`test/helpers/frames.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FRAME_RECORD_SIZE, parseFrames } from './frames';

describe('parseFrames', () => {
  it('parses consecutive records', () => {
    const buf = new Uint8Array(FRAME_RECORD_SIZE * 2);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 0, true);
    view.setUint32(FRAME_RECORD_SIZE, 1, true);
    buf[4] = 200;                        // frame 0 palette[0].r
    buf[FRAME_RECORD_SIZE + 4 + 768] = 9; // frame 1 pixel (0,0)
    const frames = parseFrames(buf);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.palette[0]).toBe(200);
    expect(frames[1]!.index).toBe(1);
    expect(frames[1]!.pixels[0]).toBe(9);
    expect(frames[1]!.pixels.length).toBe(64000);
  });
  it('rejects a partial record', () => {
    expect(() => parseFrames(new Uint8Array(FRAME_RECORD_SIZE + 1))).toThrow(/partial/);
  });
});
```

`test/helpers/frames.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FRAME_RECORD_SIZE = 4 + 768 + 64000;
export const ORACLE_DIR = fileURLToPath(new URL('../../test-data/oracle', import.meta.url));

export interface Frame { index: number; palette: Uint8Array; pixels: Uint8Array }

export function parseFrames(bytes: Uint8Array): Frame[] {
  if (bytes.length % FRAME_RECORD_SIZE !== 0) throw new Error('frames file ends in a partial record');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Frame[] = [];
  for (let p = 0; p < bytes.length; p += FRAME_RECORD_SIZE) {
    out.push({
      index: view.getUint32(p, true),
      palette: bytes.slice(p + 4, p + 772),
      pixels: bytes.slice(p + 772, p + FRAME_RECORD_SIZE),
    });
  }
  return out;
}

export function readFramesFile(path: string): Frame[] | null {
  return existsSync(path) ? parseFrames(new Uint8Array(readFileSync(path))) : null;
}
```

`test/helpers/png.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { zlibSync } from 'fflate';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function writeRgbPng(path: string, w: number, h: number, rgb: Uint8Array): void {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array()),
  ];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat(parts));
}

export function writeIndexedPng(path: string, frame: { palette: Uint8Array; pixels: Uint8Array }): void {
  const rgb = new Uint8Array(320 * 200 * 3);
  for (let i = 0; i < 64000; i++) {
    const c = frame.pixels[i]! * 3;
    rgb[i * 3] = frame.palette[c]!;
    rgb[i * 3 + 1] = frame.palette[c + 1]!;
    rgb[i * 3 + 2] = frame.palette[c + 2]!;
  }
  writeRgbPng(path, 320, 200, rgb);
}
```

Run: `pnpm test test/helpers` — Expected: PASS.
Manual check: write frame 141 of `boot.frames` to `test-output/oracle-141.png` with a
one-off `tsx -e` and look at it: Tyrian 2000 title with the 7-item menu and `oracle` in
the bottom-left corner.

- [ ] **Step 4: Commit**

```bash
git add tools/oracle test/helpers/frames.ts test/helpers/frames.test.ts test/helpers/png.ts package.json
git commit -m "feat: reference oracle (patched C build) and frame-dump tooling

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 5: Surfaces, VGA primitives, palettes (sync parts)

**Files:**
- Create: `src/video/surface.ts`, `src/video/vga256d.ts`, `src/data/palette-file.ts`, `src/video/palette.ts`
- Test: `test/video/surface.test.ts`, `test/video/vga256d.test.ts`, `test/video/palette.test.ts`

**Interfaces:**
- Consumes: `BinaryReader` (Task 2).
- Produces:
  - `surface.ts`: `VGA_WIDTH = 320`, `VGA_HEIGHT = 200`; `interface Surface { w: number; h: number; pitch: number; pixels: Uint8Array }`;
    `createSurface(w = 320, h = 200): Surface`; `copySurface(dst: Surface, src: Surface): void`; `clearSurface(s: Surface): void` (JE_clr256);
    `fillRect(s, x, y, w, h, color): void` (SDL_FillRect with clipping).
  - `vga256d.ts`: `pix(s,x,y,c)`, `pix3(s,x,y,c)`, `rectangle(s,a,b,c,d,e)`, `fillRectangleXY(s,x,y,x2,y2,color)`, `fillRectangleWH(s,x,y,w,h,color)`, `barShade(s,a,b,c,d)`, `barBright(s,a,b,c,d)`, `drawSegmentedGauge(s,x,y,color,segW,segH,segValue,value)`.
  - `palette-file.ts`: `PALETTE_COUNT = 24`; `loadPalettes(bytes: Uint8Array): Uint8Array[]` (each 768 bytes, 8-bit).
  - `palette.ts`: `class PaletteState { readonly palettes: Uint8Array[]; readonly current: Uint8Array; readonly colors: Uint8Array; version: number; constructor(palettes: Uint8Array[]); setPalette(src: Uint8Array, first: number, last: number): void; setColors(r: number, g: number, b: number, first: number, last: number): void }`;
    `initStepFadePalette(ps, diff: Int32Array, colors: Uint8Array, first, last)`; `initStepFadeSolid(ps, diff, r, g, b, first, last)`; `stepFadePalette(ps, diff, steps, first, last)`.
  - A palette is a flat `Uint8Array(768)`: entry `i` is `[i*3]=r, [i*3+1]=g, [i*3+2]=b` (8-bit).
  - `current` = C's static `palette` (what is on screen); `colors` = C's global `colors`. `version` increments on every change to `current`.

- [ ] **Step 1: Failing tests**

`test/video/surface.test.ts`:
```ts
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
```

`test/video/vga256d.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createSurface } from '../../src/video/surface';
import { barBright, barShade, drawSegmentedGauge, pix, rectangle } from '../../src/video/vga256d';

describe('vga256d', () => {
  it('pix ignores out-of-range x/y like the C (x < pitch && y < h)', () => {
    const s = createSurface();
    pix(s, 319, 199, 1);
    pix(s, 320, 0, 2);
    expect(s.pixels[63999]).toBe(1);
    expect(s.pixels[320]).toBe(0);
  });
  it('rectangle draws the outline only', () => {
    const s = createSurface();
    rectangle(s, 1, 1, 4, 3, 9);
    const at = (x: number, y: number) => s.pixels[y * 320 + x];
    expect([at(1, 1), at(4, 1), at(1, 3), at(4, 3), at(1, 2), at(4, 2)]).toEqual([9, 9, 9, 9, 9, 9]);
    expect(at(2, 2)).toBe(0);
  });
  it('barShade halves the low nibble, barBright adds 2 capped at 15', () => {
    const s = createSurface();
    s.pixels[0] = 0x3f; s.pixels[1] = 0x2e;
    barShade(s, 0, 0, 0, 0);
    expect(s.pixels[0]).toBe(0x37);
    barBright(s, 1, 0, 1, 0);
    expect(s.pixels[1]).toBe(0x2f);
  });
  it('segmented gauge', () => {
    const s = createSurface();
    drawSegmentedGauge(s, 0, 0, 0x10, 2, 1, 10, 25); // 2 full segments + half
    expect(Array.from(s.pixels.subarray(0, 9))).toEqual([0x1c, 0x1c, 0, 0x1c, 0x1c, 0, 0x16, 0x16, 0]);
  });
});
```

`test/video/palette.test.ts`:
```ts
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
```

Run: `pnpm test test/video` — Expected: FAIL.

- [ ] **Step 2: Implement `src/video/surface.ts`**

```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Replaces the 8-bit SDL_Surfaces of video.c (VGAScreen, VGAScreen2, game_screen).
export const VGA_WIDTH = 320;
export const VGA_HEIGHT = 200;

export interface Surface { w: number; h: number; pitch: number; pixels: Uint8Array }

export function createSurface(w = VGA_WIDTH, h = VGA_HEIGHT): Surface {
  return { w, h, pitch: w, pixels: new Uint8Array(w * h) };
}

export function copySurface(dst: Surface, src: Surface): void {
  dst.pixels.set(src.pixels);
}

// port of JE_clr256
export function clearSurface(s: Surface): void {
  s.pixels.fill(0);
}

/** SDL_FillRect semantics: rectangle clipped to the surface; non-positive sizes draw nothing. */
export function fillRect(s: Surface, x: number, y: number, w: number, h: number, color: number): void {
  let x0 = x, y0 = y, x1 = x + w, y1 = y + h;
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 > s.w) x1 = s.w;
  if (y1 > s.h) y1 = s.h;
  if (x1 <= x0 || y1 <= y0) return;
  for (let row = y0; row < y1; row++) s.pixels.fill(color, row * s.pitch + x0, row * s.pitch + x1);
}
```

- [ ] **Step 3: Implement `src/video/vga256d.ts`** (port of `vga256d.c` + `fill_rectangle_wh` from `vga256d.h`)

```ts
import type { Surface } from './surface';
import { fillRect } from './surface';

// port of JE_pix
export function pix(s: Surface, x: number, y: number, c: number): void {
  if (x < s.pitch && y < s.h) {
    const i = y * s.pitch + x;
    if (i >= 0) s.pixels[i] = c;
  }
}

// port of JE_pix3
export function pix3(s: Surface, x: number, y: number, c: number): void {
  pix(s, x, y, c);
  pix(s, x - 1, y, c);
  pix(s, x + 1, y, c);
  pix(s, x, y - 1, c);
  pix(s, x, y + 1, c);
}

// port of JE_rectangle (x1, y1, x2, y2, color)
export function rectangle(s: Surface, a: number, b: number, c: number, d: number, e: number): void {
  if (a < s.pitch && b < s.h && c < s.pitch && d < s.h) {
    const v = s.pixels, p = s.pitch;
    v.fill(e, b * p + a, b * p + a + (c - a + 1));
    v.fill(e, d * p + a, d * p + a + (c - a + 1));
    for (let i = (b + 1) * p + a; i < d * p + a; i += p) v[i] = e;
    for (let i = (b + 1) * p + c; i < d * p + c; i += p) v[i] = e;
  }
}

// port of fill_rectangle_xy
export function fillRectangleXY(s: Surface, x: number, y: number, x2: number, y2: number, color: number): void {
  fillRect(s, x, y, x2 - x + 1, y2 - y + 1, color);
}

// port of fill_rectangle_wh
export function fillRectangleWH(s: Surface, x: number, y: number, w: number, h: number, color: number): void {
  fillRect(s, x, y, w, h, color);
}

// port of JE_barShade
export function barShade(s: Surface, a: number, b: number, c: number, d: number): void {
  if (a < s.pitch && b < s.h && c < s.pitch && d < s.h) {
    const v = s.pixels, p = s.pitch, width = c - a + 1;
    for (let i = b * p + a; i <= d * p + a; i += p)
      for (let j = 0; j < width; j++) v[i + j] = ((v[i + j]! & 0x0f) >> 1) | (v[i + j]! & 0xf0);
  }
}

// port of JE_barBright
export function barBright(s: Surface, a: number, b: number, c: number, d: number): void {
  if (a < s.pitch && b < s.h && c < s.pitch && d < s.h) {
    const v = s.pixels, p = s.pitch, width = c - a + 1;
    for (let i = b * p + a; i <= d * p + a; i += p)
      for (let j = 0; j < width; j++) {
        const ah = v[i + j]! & 0xf0;
        let al = (v[i + j]! & 0x0f) + 2;
        if (al > 0x0f) al = 0x0f;
        v[i + j] = al + ah;
      }
  }
}

// port of draw_segmented_gauge
export function drawSegmentedGauge(
  s: Surface, x: number, y: number, color: number,
  segmentWidth: number, segmentHeight: number, segmentValue: number, value: number,
): void {
  const segments = Math.trunc(value / segmentValue);
  const partial = value % segmentValue;
  for (let i = 0; i < segments; ++i) {
    fillRectangleWH(s, x, y, segmentWidth, segmentHeight, color + 12);
    x += segmentWidth + 1;
  }
  if (partial > 0) fillRectangleWH(s, x, y, segmentWidth, segmentHeight, color + Math.trunc((12 * partial) / segmentValue));
}
```

(The C `printf` warnings for clipped rectangles are dropped.)

- [ ] **Step 4: Implement palette loader and state**

`src/data/palette-file.ts` (port of `JE_loadPals`):
```ts
export const PALETTE_COUNT = 24;

export function loadPalettes(bytes: Uint8Array): Uint8Array[] {
  if (bytes.length !== PALETTE_COUNT * 768) throw new Error(`palette.dat must hold 24 palettes (got ${bytes.length} bytes)`);
  const out: Uint8Array[] = [];
  for (let p = 0; p < PALETTE_COUNT; ++p) {
    const pal = new Uint8Array(768);
    for (let i = 0; i < 768; ++i) {
      const c = bytes[p * 768 + i]!;
      pal[i] = (c << 2) | (c >> 4);
    }
    out.push(pal);
  }
  return out;
}
```

`src/video/palette.ts` (port of `palette.c` minus the timed fades, which live in Task 12):
```ts
export class PaletteState {
  readonly current = new Uint8Array(768); // C: static Palette palette
  readonly colors = new Uint8Array(768);  // C: Palette colors
  version = 0;

  constructor(readonly palettes: Uint8Array[]) {}

  // port of set_palette
  setPalette(src: Uint8Array, first: number, last: number): void {
    this.current.set(src.subarray(first * 3, (last + 1) * 3), first * 3);
    this.version++;
  }

  // port of set_colors
  setColors(r: number, g: number, b: number, first: number, last: number): void {
    for (let i = first; i <= last; i++) {
      this.current[i * 3] = r;
      this.current[i * 3 + 1] = g;
      this.current[i * 3 + 2] = b;
    }
    this.version++;
  }
}

// port of init_step_fade_palette
export function initStepFadePalette(ps: PaletteState, diff: Int32Array, colors: Uint8Array, first: number, last: number): void {
  for (let i = first * 3; i < (last + 1) * 3; i++) diff[i] = colors[i]! - ps.current[i]!;
}

// port of init_step_fade_solid
export function initStepFadeSolid(ps: PaletteState, diff: Int32Array, r: number, g: number, b: number, first: number, last: number): void {
  for (let i = first; i <= last; i++) {
    diff[i * 3] = r - ps.current[i * 3]!;
    diff[i * 3 + 1] = g - ps.current[i * 3 + 1]!;
    diff[i * 3 + 2] = b - ps.current[i * 3 + 2]!;
  }
}

// port of step_fade_palette
export function stepFadePalette(ps: PaletteState, diff: Int32Array, steps: number, first: number, last: number): void {
  if (steps <= 0) throw new Error('stepFadePalette: steps must be > 0');
  for (let i = first * 3; i < (last + 1) * 3; i++) {
    const delta = Math.trunc(diff[i]! / steps);
    diff[i] = diff[i]! - delta;
    ps.current[i] = ps.current[i]! + delta; // Uint8 wraps like the C
  }
  ps.version++;
}
```

Run: `pnpm test test/video` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/video src/data/palette-file.ts test/video
git commit -m "feat: surfaces, VGA primitives, palette state and fade steps

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 6: Fullscreen pictures (`tyrian.pic`)

**Files:**
- Create: `src/data/pcxmast.ts`, `src/data/pic.ts`
- Test: `test/data/pic.test.ts`

**Interfaces:**
- Consumes: `BinaryReader`, `Surface`, `PaletteState`.
- Produces:
  - `pcxmast.ts`: `PCX_NUM = 14`; `PCX_PAL: readonly number[]` (= `[0, 7, 5, 8, 10, 5, 18, 19, 19, 20, 21, 22, 5, 23]`); `FACE_PAL: readonly number[]` (= `[1, 2, 3, 4, 6, 9, 11, 12, 16, 13, 14, 15]`).
  - `pic.ts`: `class PicFile { constructor(bytes: Uint8Array); readonly count: number; decode(picNumber: number, out: Uint8Array /*64000*/): void }`;
    `loadPic(pics: PicFile, ps: PaletteState, surface: Surface, picNumber: number, storePal: boolean): void` — `picNumber` is 1-based like the C.

File layout: `u16 count(=14)`, `s32 offsets[14]`, bodies; body *n* ends where *n+1* starts (last ends at EOF). Body is RLE: byte `b` with `(b & 0xc0) == 0xc0` → run of `b & 0x3f` copies of the next byte; otherwise a literal pixel.

- [ ] **Step 1: Failing tests**

`test/data/pic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PicFile, loadPic } from '../../src/data/pic';
import { loadPalettes } from '../../src/data/palette-file';
import { PCX_PAL } from '../../src/data/pcxmast';
import { PaletteState } from '../../src/video/palette';
import { createSurface } from '../../src/video/surface';
import { describeData, testArchive } from '../helpers/data';

function buildPicFile(bodies: number[][]): Uint8Array {
  const header = 2 + 14 * 4;
  const out: number[] = [14, 0];
  let off = header;
  const offsets: number[] = [];
  for (let i = 0; i < 14; i++) { offsets.push(off); off += (bodies[i] ?? []).length; }
  for (const o of offsets) out.push(o & 0xff, (o >> 8) & 0xff, (o >> 16) & 0xff, (o >> 24) & 0xff);
  for (let i = 0; i < 14; i++) out.push(...(bodies[i] ?? []));
  return new Uint8Array(out);
}

describe('PicFile', () => {
  it('decodes RLE runs and literals', () => {
    // 1000 runs of 64 pixels (0xc0|0x40 is not a valid count, so use 0xc0|63=0xff for 63 px)
    const body: number[] = [];
    let left = 64000 - 3;
    body.push(5, 6, 7);                  // three literals
    while (left > 0) { const n = Math.min(63, left); body.push(0xc0 | n, 9); left -= n; }
    const pics = new PicFile(buildPicFile([body]));
    const out = new Uint8Array(64000);
    pics.decode(1, out);
    expect(Array.from(out.subarray(0, 4))).toEqual([5, 6, 7, 9]);
    expect(out[63999]).toBe(9);
  });
  it('loadPic copies palettes[pcxpal[n-1]] into colors and optionally sets it', () => {
    const body: number[] = [];
    for (let left = 64000; left > 0; left -= 63) body.push(0xc0 | Math.min(63, left), 1);
    const bodies = Array.from({ length: 14 }, () => body);
    const pics = new PicFile(buildPicFile(bodies));
    const palettes = Array.from({ length: 24 }, (_, i) => new Uint8Array(768).fill(i));
    const ps = new PaletteState(palettes);
    const s = createSurface();
    loadPic(pics, ps, s, 2, false);
    expect(ps.colors[0]).toBe(PCX_PAL[1]);
    expect(ps.current[0]).toBe(0);
    loadPic(pics, ps, s, 2, true);
    expect(ps.current[0]).toBe(PCX_PAL[1]);
  });
});

describeData('real tyrian.pic', () => {
  it('every picture decodes to exactly 64000 pixels without overrunning its body', () => {
    const pics = new PicFile(testArchive!.get('tyrian.pic'));
    expect(pics.count).toBe(14);
    const out = new Uint8Array(64000);
    for (let n = 1; n <= 14; n++) expect(() => pics.decode(n, out)).not.toThrow();
  });
  it('title picture (4) uses palette 10', () => {
    const ps = new PaletteState(loadPalettes(testArchive!.get('palette.dat')));
    loadPic(new PicFile(testArchive!.get('tyrian.pic')), ps, createSurface(), 4, false);
    expect(Array.from(ps.colors)).toEqual(Array.from(ps.palettes[10]!));
  });
});
```

Run: `pnpm test test/data/pic.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement**

`src/data/pcxmast.ts` (port of `pcxmast.c`):
```ts
export const PCX_NUM = 14;
export const PCX_PAL: readonly number[] = [0, 7, 5, 8, 10, 5, 18, 19, 19, 20, 21, 22, 5, 23];
export const FACE_PAL: readonly number[] = [1, 2, 3, 4, 6, 9, 11, 12, 16, 13, 14, 15];
```

`src/data/pic.ts` (port of `picload.c`):
```ts
import { BinaryReader } from '../core/binary-reader';
import type { PaletteState } from '../video/palette';
import type { Surface } from '../video/surface';
import { PCX_NUM, PCX_PAL } from './pcxmast';

export class PicFile {
  readonly count = PCX_NUM;
  private readonly pos: number[] = [];

  constructor(private readonly bytes: Uint8Array) {
    const r = new BinaryReader(bytes);
    r.u16(); // picture count (unused by the C)
    for (let i = 0; i < PCX_NUM; i++) this.pos.push(r.s32());
    this.pos.push(bytes.length);
  }

  /** RLE-decode picture `picNumber` (1-based) into a 320x200 buffer. */
  decode(picNumber: number, out: Uint8Array): void {
    const n = picNumber - 1;
    if (n < 0 || n >= PCX_NUM) throw new RangeError(`picture ${picNumber} out of range`);
    const end = this.pos[n + 1]!;
    let p = this.pos[n]!;
    const b = this.bytes;
    for (let i = 0; i < 320 * 200; ) {
      if (p >= end) throw new RangeError(`picture ${picNumber}: RLE data ends early`);
      const c = b[p]!;
      if ((c & 0xc0) === 0xc0) {
        const run = c & 0x3f;
        out.fill(b[p + 1]!, i, i + run);
        i += run;
        p += 2;
      } else {
        out[i++] = c;
        p++;
      }
    }
  }
}

// port of JE_loadPic
export function loadPic(pics: PicFile, ps: PaletteState, surface: Surface, picNumber: number, storePal: boolean): void {
  pics.decode(picNumber, surface.pixels);
  ps.colors.set(ps.palettes[PCX_PAL[picNumber - 1]!]!);
  if (storePal) ps.setPalette(ps.colors, 0, 255);
}
```

Run: `pnpm test test/data/pic.test.ts` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/data/pcxmast.ts src/data/pic.ts test/data/pic.test.ts
git commit -m "feat: tyrian.pic loader (JE_loadPic)

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 7: Sprite tables + `blit_sprite*`

**Files:**
- Create: `src/video/sprite.ts`
- Test: `test/video/sprite.test.ts`

**Interfaces:**
- Consumes: `BinaryReader`, `Surface`, `u8`.
- Produces (`src/video/sprite.ts`):
  - Constants `FONT_SHAPES = 0, SMALL_FONT_SHAPES = 1, TINY_FONT = 2, PLANET_SHAPES = 3, FACE_SHAPES = 4, OPTION_SHAPES = 5, WEAPON_SHAPES = 6, EXTRA_SHAPES = 7, SPRITE_TABLES_MAX = 8, SPRITES_PER_TABLE_MAX = 152`.
  - `interface Sprite { width: number; height: number; size: number; data: Uint8Array | null }`
  - `interface SpriteTable { count: number; sprites: Sprite[] /* always length 152 */ }`
  - `emptySpriteTable(): SpriteTable`; `loadSpriteTable(r: BinaryReader): SpriteTable` (port of `load_sprites`).
  - `spriteExists(t: SpriteTable, i: number): boolean`; `spriteWidth(t, i)`, `spriteHeight(t, i)` (0 when missing).
  - `blitSprite(s, x, y, t, i)`, `blitSpriteBlend(s, x, y, t, i)`, `blitSpriteHvUnsafe(s, x, y, t, i, hue, value)`, `blitSpriteHv(s, x, y, t, i, hue, value)`, `blitSpriteHvBlend(s, x, y, t, i, hue, value)`, `blitSpriteDark(s, x, y, t, i, black: boolean)`.

Sprite data format: `255 n` = skip `n` transparent pixels; `254` = end of row (advance to the
end of the row); `253` = one transparent pixel; any other byte = an opaque pixel. Drawing
does **not** clip horizontally — it advances a linear pointer `y*pitch+x`, writes only if
`ptr >= 0`, and **returns** once `ptr >= h*pitch`. When `x_offset >= width`, the pointer
moves to the next row (`ptr += pitch - x_offset`). Missing sprites (index ≥ count or no data)
draw nothing (release build of the C: the `assert` is compiled out).

- [ ] **Step 1: Failing tests**

`test/video/sprite.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BinaryReader } from '../../src/core/binary-reader';
import { createSurface } from '../../src/video/surface';
import {
  PLANET_SHAPES, blitSprite, blitSpriteBlend, blitSpriteDark, blitSpriteHv, blitSpriteHvBlend,
  blitSpriteHvUnsafe, emptySpriteTable, loadSpriteTable, spriteWidth, type SpriteTable,
} from '../../src/video/sprite';
import { describeData, testArchive } from '../helpers/data';

function table(width: number, height: number, data: number[]): SpriteTable {
  const t = emptySpriteTable();
  t.count = 1;
  t.sprites[0] = { width, height, size: data.length, data: new Uint8Array(data) };
  return t;
}
const at = (s: { pixels: Uint8Array }, x: number, y: number) => s.pixels[y * 320 + x];

describe('blitSprite', () => {
  it('handles literals, 253, 255 n and 254 row ends', () => {
    // 3 wide: row0 = [1, skip, 2]; row1 = [skip 2 via 255 2, 3]; row2 = [4, end-of-row]
    const t = table(3, 3, [1, 253, 2, 255, 2, 3, 4, 254]);
    const s = createSurface();
    s.pixels.fill(0xee);
    blitSprite(s, 10, 10, t, 0);
    expect([at(s, 10, 10), at(s, 11, 10), at(s, 12, 10)]).toEqual([1, 0xee, 2]);
    expect([at(s, 10, 11), at(s, 11, 11), at(s, 12, 11)]).toEqual([0xee, 0xee, 3]);
    expect([at(s, 10, 12), at(s, 11, 12), at(s, 12, 12)]).toEqual([4, 0xee, 0xee]);
  });
  it('wraps onto the next row instead of clipping at the right edge', () => {
    const t = table(3, 1, [7, 7, 7]);
    const s = createSurface();
    blitSprite(s, 318, 5, t, 0);
    expect([at(s, 318, 5), at(s, 319, 5), at(s, 0, 6)]).toEqual([7, 7, 7]);
  });
  it('stops at the bottom of the surface and skips writes above the top', () => {
    const t = table(1, 3, [5, 5, 5]);
    const s = createSurface();
    blitSprite(s, 0, 198, t, 0);
    expect([at(s, 0, 198), at(s, 0, 199)]).toEqual([5, 5]);
    const s2 = createSurface();
    blitSprite(s2, 0, -2, t, 0);
    expect(at(s2, 0, 0)).toBe(5);
    expect(s2.pixels.reduce((a, b) => a + b, 0)).toBe(5);
  });
  it('ignores missing sprites', () => {
    const s = createSurface();
    expect(() => blitSprite(s, 0, 0, emptySpriteTable(), 3)).not.toThrow();
  });
});

describe('blit variants', () => {
  const t = table(1, 1, [0x47]);
  it('blend averages low nibbles, keeps src hue', () => {
    const s = createSurface(); s.pixels[0] = 0x2b;
    blitSpriteBlend(s, 0, 0, t, 0);
    expect(s.pixels[0]).toBe(0x49); // 0x40 | ((0xb + 0x7) / 2)
  });
  it('hv_unsafe ORs hue with (value nibble + value), overflow leaks into hue', () => {
    const s = createSurface();
    blitSpriteHvUnsafe(s, 0, 0, t, 0, 3, 10); // 0x30 | (7 + 10 = 17 = 0x11) = 0x31
    expect(s.pixels[0]).toBe(0x31);
  });
  it('hv clamps: >0xf saturates to 0xf, >=0x1f (incl. negative wrap) to 0', () => {
    const s = createSurface();
    blitSpriteHv(s, 0, 0, t, 0, 3, 10);
    expect(s.pixels[0]).toBe(0x3f);
    blitSpriteHv(s, 0, 0, t, 0, 3, -10); // 7-10 = -3 -> u8 253 -> 0
    expect(s.pixels[0]).toBe(0x30);
    blitSpriteHv(s, 0, 0, t, 0, 3, -3);
    expect(s.pixels[0]).toBe(0x34);
  });
  it('hv_blend averages with destination low nibble', () => {
    const s = createSurface(); s.pixels[0] = 0x0a;
    blitSpriteHvBlend(s, 0, 0, t, 0, 2, 1); // t = 8; (0xa + 8) / 2 = 9
    expect(s.pixels[0]).toBe(0x29);
  });
  it('dark halves the destination or paints black', () => {
    const s = createSurface(); s.pixels[0] = 0x5e;
    blitSpriteDark(s, 0, 0, t, 0, false);
    expect(s.pixels[0]).toBe(0x57);
    blitSpriteDark(s, 0, 0, t, 0, true);
    expect(s.pixels[0]).toBe(0);
  });
});

describeData('real tyrian.shp sprite tables', () => {
  it('table 3 (planet shapes) has 152 sprites; logo 146 is 304x121', () => {
    const bytes = testArchive!.get('tyrian.shp');
    const r = new BinaryReader(bytes);
    r.seek(new DataView(bytes.buffer, bytes.byteOffset).getInt32(2 + 3 * 4, true));
    const t = loadSpriteTable(r);
    expect(t.count).toBe(152);
    expect(spriteWidth(t, 146)).toBe(304);
    expect(t.sprites[146]!.height).toBe(121);
    expect(PLANET_SHAPES).toBe(3);
  });
});
```

Run: `pnpm test test/video/sprite.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement `src/video/sprite.ts`** (port of the table half of `sprite.c`)

```ts
import { BinaryReader } from '../core/binary-reader';
import { u8 } from '../core/int';
import type { Surface } from './surface';

export const FONT_SHAPES = 0;
export const SMALL_FONT_SHAPES = 1;
export const TINY_FONT = 2;
export const PLANET_SHAPES = 3;
export const FACE_SHAPES = 4;
export const OPTION_SHAPES = 5; // also help shapes
export const WEAPON_SHAPES = 6;
export const EXTRA_SHAPES = 7;  // ending pics
export const SPRITE_TABLES_MAX = 8;
export const SPRITES_PER_TABLE_MAX = 152;

export interface Sprite { width: number; height: number; size: number; data: Uint8Array | null }
export interface SpriteTable { count: number; sprites: Sprite[] }

export function emptySpriteTable(): SpriteTable {
  return {
    count: 0,
    sprites: Array.from({ length: SPRITES_PER_TABLE_MAX }, () => ({ width: 0, height: 0, size: 0, data: null })),
  };
}

// port of load_sprites
export function loadSpriteTable(r: BinaryReader): SpriteTable {
  const t = emptySpriteTable();
  t.count = r.u16();
  if (t.count > SPRITES_PER_TABLE_MAX) throw new Error(`sprite table too large: ${t.count}`);
  for (let i = 0; i < t.count; ++i) {
    if (!r.bool()) continue; // sprite is empty
    const width = r.u16(), height = r.u16(), size = r.u16();
    t.sprites[i] = { width, height, size, data: r.bytes(size) };
  }
  return t;
}

export const spriteExists = (t: SpriteTable, i: number): boolean => t.sprites[i]?.data != null;
export const spriteWidth = (t: SpriteTable, i: number): number => (spriteExists(t, i) ? t.sprites[i]!.width : 0);
export const spriteHeight = (t: SpriteTable, i: number): number => (spriteExists(t, i) ? t.sprites[i]!.height : 0);

/** Shared walker for every blit_sprite* variant: `op(dst, src)` returns the new pixel. */
function blitWith(s: Surface, x: number, y: number, t: SpriteTable, index: number, op: (dst: number, src: number) => number): void {
  if (index >= t.count || !spriteExists(t, index)) return;
  const sp = t.sprites[index]!;
  const data = sp.data!;
  const width = sp.width;
  const px = s.pixels;
  const ul = s.h * s.pitch;
  let p = y * s.pitch + x;
  let xOff = 0;
  for (let d = 0; d < sp.size; ++d) {
    const v = data[d]!;
    switch (v) {
      case 255: // transparent run, next byte is the count
        d++;
        p += data[d]!;
        xOff += data[d]!;
        break;
      case 254: // next pixel row
        p += width - xOff;
        xOff = width;
        break;
      case 253: // one transparent pixel
        p++;
        xOff++;
        break;
      default:
        if (p >= ul) return;
        if (p >= 0) px[p] = op(px[p]!, v);
        p++;
        xOff++;
        break;
    }
    if (xOff >= width) {
      p += s.pitch - xOff;
      xOff = 0;
    }
  }
}

// port of blit_sprite (JE_newDrawCShapeNum)
export function blitSprite(s: Surface, x: number, y: number, t: SpriteTable, i: number): void {
  blitWith(s, x, y, t, i, (_d, v) => v);
}

// port of blit_sprite_blend (JE_newDrawCShapeTrick)
export function blitSpriteBlend(s: Surface, x: number, y: number, t: SpriteTable, i: number): void {
  blitWith(s, x, y, t, i, (d, v) => (v & 0xf0) | (((d & 0x0f) + (v & 0x0f)) >> 1));
}

// port of blit_sprite_hv_unsafe (JE_newDrawCShapeBright) — value may overflow into hue
export function blitSpriteHvUnsafe(s: Surface, x: number, y: number, t: SpriteTable, i: number, hue: number, value: number): void {
  const h = u8(hue << 4);
  blitWith(s, x, y, t, i, (_d, v) => u8(h | ((v & 0x0f) + value)));
}

function hvValue(v: number, value: number): number {
  let tv = u8((v & 0x0f) + value);
  if (tv > 0xf) tv = tv >= 0x1f ? 0x0 : 0xf;
  return tv;
}

// port of blit_sprite_hv (JE_newDrawCShapeAdjust)
export function blitSpriteHv(s: Surface, x: number, y: number, t: SpriteTable, i: number, hue: number, value: number): void {
  const h = u8(hue << 4);
  blitWith(s, x, y, t, i, (_d, v) => h | hvValue(v, value));
}

// port of blit_sprite_hv_blend (JE_newDrawCShapeModify)
export function blitSpriteHvBlend(s: Surface, x: number, y: number, t: SpriteTable, i: number, hue: number, value: number): void {
  const h = u8(hue << 4);
  blitWith(s, x, y, t, i, (d, v) => h | (((d & 0x0f) + hvValue(v, value)) >> 1));
}

// port of blit_sprite_dark (JE_newDrawCShapeDarken / JE_newDrawCShapeShadow)
export function blitSpriteDark(s: Surface, x: number, y: number, t: SpriteTable, i: number, black: boolean): void {
  blitWith(s, x, y, t, i, (d) => (black ? 0x00 : (d & 0xf0) | ((d & 0x0f) >> 1)));
}
```

Run: `pnpm test test/video/sprite.test.ts` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/video/sprite.ts test/video/sprite.test.ts
git commit -m "feat: sprite tables and blit_sprite* ports

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 8: Sprite2 sheets, `blit_sprite2*`, main shape tables

**Files:**
- Create: `src/video/sprite2.ts`, `src/data/shapes.ts`
- Test: `test/video/sprite2.test.ts`, `test/data/shapes.test.ts`

**Interfaces:**
- Consumes: `BinaryReader`, `Surface`, `VGA_WIDTH`, `SpriteTable`/`loadSpriteTable`/`emptySpriteTable` (Task 7), `DataArchive` (Task 3).
- Produces:
  - `sprite2.ts`: `interface Sprite2Sheet { data: Uint8Array }`;
    `blitSprite2(s, x, y, sheet, index)`, `blitSprite2Clip`, `blitSprite2Blend`, `blitSprite2Darken`, `blitSprite2Filter(s, x, y, sheet, index, filter)`, `blitSprite2FilterClip(…, filter)`,
    `blitSprite2x2`, `blitSprite2x2Clip`, `blitSprite2x2Blend`, `blitSprite2x2Darken`, `blitSprite2x2Filter(…, filter)`, `blitSprite2x2FilterClip(…, filter)`. `index` is 1-based like the C.
  - `shapes.ts`: `interface MainShapes { tables: SpriteTable[] /* length 8; [7] empty */; spriteSheet8: Sprite2Sheet; spriteSheet9: Sprite2Sheet; spriteSheet10: Sprite2Sheet; spriteSheet11: Sprite2Sheet; spriteSheet12: Sprite2Sheet; spriteSheetT2000: Sprite2Sheet }`;
    `loadMainShapeTables(bytes: Uint8Array): MainShapes` (port of `JE_loadMainShapeTables`);
    `loadCompShapes(archive: DataArchive, s: string): Sprite2Sheet` (port of `JE_loadCompShapes`; file `newsh${s.toLowerCase()}.shp`).

Sprite2 format: `u16 offsets[]` at the start of the sheet; sprite *index* starts at
`offsets[index-1]`. Then bytes until `0x0f`: low nibble = transparent count (advance),
high nibble = opaque count followed by that many pixel bytes; a byte whose high nibble is 0
means "next row": pointer `+= 320 - 12` (sprites are 12 wide; the C uses `VGAScreen->pitch`,
always 320). Non-clip variants: linear pointer, skip writes `< 0`, return when `>= h*pitch`.
Clip variants: track `x,y`; return when `y >= h`; rows with `y < 0` are skipped (data
pointer still advances); writes only when `0 <= x < pitch`.
x2 variants draw indices `i, i+1, i+19, i+20` at `(x,y) (x+12,y) (x,y+14) (x+12,y+14)`.

- [ ] **Step 1: Failing tests**

`test/video/sprite2.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createSurface } from '../../src/video/surface';
import {
  blitSprite2, blitSprite2Blend, blitSprite2Clip, blitSprite2Darken, blitSprite2Filter,
  blitSprite2FilterClip, blitSprite2x2, type Sprite2Sheet,
} from '../../src/video/sprite2';

// One sprite at index 1: row0 = skip 1, 2 opaque [5,6]; next row; row1 = 1 opaque [7]; end.
function sheet(): Sprite2Sheet {
  const body = [0x21, 5, 6, 0x00, 0x10, 7, 0x0f];
  return { data: new Uint8Array([2, 0, ...body]) };
}
const at = (s: { pixels: Uint8Array }, x: number, y: number) => s.pixels[y * 320 + x];

describe('blitSprite2', () => {
  it('decodes nibble runs and row advance (row start = x)', () => {
    const s = createSurface();
    blitSprite2(s, 20, 10, sheet(), 1);
    expect([at(s, 20, 10), at(s, 21, 10), at(s, 22, 10)]).toEqual([0, 5, 6]);
    // after 0x00: pointer at x=23 → +320-12 → row 11, x=11+… ; C: next row starts 12 px left of x+12
    expect(at(s, 11, 11)).toBe(7);
  });
  it('clip variant skips negative rows and off-screen x', () => {
    const s = createSurface();
    blitSprite2Clip(s, -1, -1, sheet(), 1); // row -1 skipped; row 0: x = -1 + 3 - 12 = -10 → off-screen
    expect(s.pixels.reduce((a, b) => a + b, 0)).toBe(0);
    blitSprite2Clip(s, 318, 0, sheet(), 1);
    expect([at(s, 319, 0)]).toEqual([5]); // x=320 for the 6 is clipped
  });
  it('blend / darken / filter', () => {
    const s = createSurface();
    s.pixels[10 * 320 + 21] = 0x13;
    blitSprite2Blend(s, 20, 10, sheet(), 1);
    expect(at(s, 21, 10)).toBe(0x04); // ((5 & 0xf) + 3) / 2 = 4 | (5 & 0xf0)
    const d = createSurface();
    d.pixels[10 * 320 + 21] = 0x2e;
    blitSprite2Darken(d, 20, 10, sheet(), 1);
    expect(at(d, 21, 10)).toBe(0x27);
    const f = createSurface();
    blitSprite2Filter(f, 20, 10, sheet(), 1, 0xf0);
    expect(at(f, 21, 10)).toBe(0xf5);
    const fc = createSurface();
    blitSprite2FilterClip(fc, 20, 10, sheet(), 1, 0xf0);
    expect(at(fc, 22, 10)).toBe(0xf6);
  });
  it('x2 draws four sub-sprites with index offsets 0, 1, 19, 20', () => {
    const offsets = new Array(21).fill(0);
    const bodies: number[] = [];
    const base = 21 * 2;
    for (const [idx, color] of [[1, 1], [2, 2], [20, 3], [21, 4]] as const) {
      offsets[idx - 1] = base + bodies.length;
      bodies.push(0x10, color, 0x0f);
    }
    const data = new Uint8Array(base + bodies.length);
    offsets.forEach((o, i) => { data[i * 2] = o & 0xff; data[i * 2 + 1] = o >> 8; });
    data.set(bodies, base);
    const s = createSurface();
    blitSprite2x2(s, 0, 0, { data }, 1);
    expect([at(s, 0, 0), at(s, 12, 0), at(s, 0, 14), at(s, 12, 14)]).toEqual([1, 2, 3, 4]);
  });
});
```

`test/data/shapes.test.ts`:
```ts
import { expect, it } from 'vitest';
import { loadCompShapes, loadMainShapeTables } from '../../src/data/shapes';
import { describeData, testArchive } from '../helpers/data';

describeData('real tyrian.shp main tables', () => {
  it('loads 7 sprite tables with the known counts and 6 sprite2 sheets', () => {
    const m = loadMainShapeTables(testArchive!.get('tyrian.shp'));
    expect(m.tables.map((t) => t.count)).toEqual([60, 85, 127, 152, 18, 47, 22, 0]);
    expect(m.spriteSheet8.data.length).toBe(382486 - 350426);
    expect(m.spriteSheetT2000.data.length).toBe(505983 - 493635);
  });
  it('loads newsh1.shp (shop sprites incl. mouse pointers)', () => {
    expect(loadCompShapes(testArchive!, '1').data.length).toBe(testArchive!.get('newsh1.shp').length);
  });
});
```

Run: `pnpm test test/video/sprite2.test.ts test/data/shapes.test.ts` — Expected: FAIL.

Note for the row-advance test: trace the C by hand if in doubt — after `0x21,5,6` the
pointer is at `x+3`; `0x00` adds `0` then `320-12`, landing at row `y+1`, column `x+3-12 = x-9`;
then `0x10` writes `7` there. With `x = 20` that is column 11. The test encodes that.

- [ ] **Step 2: Implement `src/video/sprite2.ts`** (port of the sprite2 half of `sprite.c`)

```ts
import type { Surface } from './surface';
import { VGA_WIDTH } from './surface';

export interface Sprite2Sheet { data: Uint8Array }

type Op = (dst: number, src: number) => number;

function start(sheet: Sprite2Sheet, index: number): number {
  const d = sheet.data;
  return d[(index - 1) * 2]! | (d[(index - 1) * 2 + 1]! << 8);
}

function blit2(s: Surface, x: number, y: number, sheet: Sprite2Sheet, index: number, op: Op): void {
  const data = sheet.data;
  const px = s.pixels;
  const ul = s.h * s.pitch;
  let p = y * s.pitch + x;
  for (let d = start(sheet, index); data[d] !== 0x0f; ++d) {
    p += data[d]! & 0x0f;                 // transparent pixel count
    let count = (data[d]! & 0xf0) >> 4;   // opaque pixel count
    if (count === 0) {
      p += VGA_WIDTH - 12;                // next pixel row
    } else {
      while (count--) {
        ++d;
        if (p >= ul) return;
        if (p >= 0) px[p] = op(px[p]!, data[d]!);
        ++p;
      }
    }
  }
}

function blit2Clip(s: Surface, x: number, y: number, sheet: Sprite2Sheet, index: number, op: Op): void {
  const data = sheet.data;
  for (let d = start(sheet, index); data[d] !== 0x0f; ++d) {
    if (y >= s.h) return;
    const skip = data[d]! & 0x0f;
    let fill = (data[d]! >> 4) & 0x0f;
    x += skip;
    if (fill === 0) {
      y += 1;
      x -= 12;
    } else if (y >= 0) {
      const row = y * s.pitch;
      do {
        ++d;
        if (x >= 0 && x < s.pitch) s.pixels[row + x] = op(s.pixels[row + x]!, data[d]!);
        x += 1;
      } while (--fill);
    } else {
      d += fill;
      x += fill;
    }
  }
}

const plain: Op = (_d, v) => v;
const blend: Op = (d, v) => (((v & 0x0f) + (d & 0x0f)) >> 1) | (v & 0xf0);
const darken: Op = (d) => ((d & 0x0f) >> 1) + (d & 0xf0);
const filterOp = (filter: number): Op => (_d, v) => filter | (v & 0x0f);

// ports of blit_sprite2, _clip, _blend, _darken, _filter, _filter_clip
export const blitSprite2 = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number) => blit2(s, x, y, sh, i, plain);
export const blitSprite2Clip = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number) => blit2Clip(s, x, y, sh, i, plain);
export const blitSprite2Blend = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number) => blit2(s, x, y, sh, i, blend);
export const blitSprite2Darken = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number) => blit2(s, x, y, sh, i, darken);
export const blitSprite2Filter = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number, f: number) => blit2(s, x, y, sh, i, filterOp(f));
export const blitSprite2FilterClip = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number, f: number) => blit2Clip(s, x, y, sh, i, filterOp(f));

type One = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number) => void;
function x2(one: One): One {
  return (s, x, y, sh, i) => {
    one(s, x, y, sh, i);
    one(s, x + 12, y, sh, i + 1);
    one(s, x, y + 14, sh, i + 19);
    one(s, x + 12, y + 14, sh, i + 20);
  };
}

// ports of blit_sprite2x2*
export const blitSprite2x2 = x2(blitSprite2);
export const blitSprite2x2Clip = x2(blitSprite2Clip);
export const blitSprite2x2Blend = x2(blitSprite2Blend);
export const blitSprite2x2Darken = x2(blitSprite2Darken);
export const blitSprite2x2Filter = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number, f: number) =>
  x2((s2, x2_, y2, sh2, i2) => blitSprite2Filter(s2, x2_, y2, sh2, i2, f))(s, x, y, sh, i);
export const blitSprite2x2FilterClip = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number, f: number) =>
  x2((s2, x2_, y2, sh2, i2) => blitSprite2FilterClip(s2, x2_, y2, sh2, i2, f))(s, x, y, sh, i);
```

- [ ] **Step 3: Implement `src/data/shapes.ts`**

```ts
import { BinaryReader } from '../core/binary-reader';
import type { Sprite2Sheet } from '../video/sprite2';
import { emptySpriteTable, loadSpriteTable, type SpriteTable } from '../video/sprite';
import type { DataArchive } from './archive';

export interface MainShapes {
  tables: SpriteTable[];
  spriteSheet8: Sprite2Sheet;      // player shots (shapesC1)
  spriteSheet9: Sprite2Sheet;      // player ships (shapes9)
  spriteSheet10: Sprite2Sheet;     // power-ups (eShapes6)
  spriteSheet11: Sprite2Sheet;     // coins, datacubes (eShapes5)
  spriteSheet12: Sprite2Sheet;     // more player shots (shapesW2)
  spriteSheetT2000: Sprite2Sheet;  // Tyrian 2000 ships (shapesT2k)
}

// port of JE_loadMainShapeTables
export function loadMainShapeTables(bytes: Uint8Array): MainShapes {
  const SHP_NUM = 13;
  const r = new BinaryReader(bytes);
  const shpNumb = r.u16();
  if (shpNumb !== SHP_NUM) throw new Error(`unexpected shape file table count ${shpNumb}`);
  const pos: number[] = [];
  for (let i = 0; i < shpNumb; i++) pos.push(r.s32());
  pos.push(bytes.length);

  const tables: SpriteTable[] = [];
  for (let i = 0; i < 7; i++) {
    r.seek(pos[i]!);
    tables.push(loadSpriteTable(r));
  }
  tables.push(emptySpriteTable()); // EXTRA_SHAPES, loaded later by the ending
  const sheet = (i: number): Sprite2Sheet => ({ data: bytes.slice(pos[i]!, pos[i + 1]!) });
  return {
    tables,
    spriteSheet8: sheet(7),
    spriteSheet9: sheet(8),
    spriteSheet10: sheet(9),
    spriteSheet11: sheet(10),
    spriteSheet12: sheet(11),
    spriteSheetT2000: sheet(12),
  };
}

// port of JE_loadCompShapes
export function loadCompShapes(archive: DataArchive, s: string): Sprite2Sheet {
  return { data: archive.get(`newsh${s.toLowerCase()}.shp`).slice() };
}
```

Note: the C reads each sheet starting at the stream position left by the previous load
(`JE_loadCompShapesB` reads `size` bytes from the current position). Since the tables are
contiguous (`end == next` for every table — verified during planning), slicing by
`pos[i]..pos[i+1]` is equivalent.

Run: `pnpm test test/video/sprite2.test.ts test/data/shapes.test.ts` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/video/sprite2.ts src/data/shapes.ts test/video/sprite2.test.ts test/data/shapes.test.ts
git commit -m "feat: sprite2 sheets, blit_sprite2* ports, main shape tables

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 9: Fonts (`font.c`, text parts of `fonthand.c`)

**Files:**
- Create: `src/video/font.ts`, `src/video/fonthand.ts`
- Test: `test/video/font.test.ts`

**Interfaces:**
- Consumes: `Surface`; sprite tables + `blitSpriteHv`, `blitSpriteHvUnsafe`, `blitSpriteHvBlend`, `blitSpriteDark`, `spriteExists`, `TINY_FONT` (Task 7); `s8` (Task 2).
- Produces:
  - `font.ts`: `enum Font { Large = 0, Normal = 1, Small = 2 }`; `enum Align { Left, Centered, Right }`; `FONT_ASCII: Int16Array(256)`;
    `drawFontHv(s, tables, x, y, text, font, align, hue, value)`, `drawFontHvBlend(…same)`, `drawFontDark(s, tables, x, y, text, font, align, black)`,
    `drawFontHvShadow(s, tables, x, y, text, font, align, hue, value, black, shadowDist)`, `drawFontHvFullShadow(…same)`.
  - `fonthand.ts`: `PART_SHADE = 0, FULL_SHADE = 1, DARKEN = 2, TRICK = 3`;
    `textWidth(text, tables, font: number): number`; `fontCenter(text, tables, font): number`;
    `dString(s, tables, x, y, text, font)`; `outText(s, tables, x, y, text, colorbank, brightness)`;
    `outTextModify(s, tables, x, y, text, filter, brightness, font)`; `outTextAdjust(s, tables, x, y, text, filter, brightness, font, shadow)`;
    `outTextAndDarken(s, tables, x, y, text, colorbank, brightness, font)`; `textShade(s, tables, x, y, text, colorbank, brightness, shadetype)`.
  - `tables` is always `readonly SpriteTable[]` (the 8 main tables); `font` indexes it.

Out of scope here (game-state dependent, later sub-projects): `JE_updateWarning`, `JE_outTextGlow`.

- [ ] **Step 1: Failing tests**

`test/video/font.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Align, FONT_ASCII, Font, drawFontHv } from '../../src/video/font';
import { dString, fontCenter, textWidth } from '../../src/video/fonthand';
import { emptySpriteTable, type SpriteTable } from '../../src/video/sprite';
import { createSurface } from '../../src/video/surface';
import { loadMainShapeTables } from '../../src/data/shapes';
import { describeData, testArchive } from '../helpers/data';

// Font table where every glyph is a 2x1 sprite of pixel value 0x05.
function fakeTables(): SpriteTable[] {
  const t = emptySpriteTable();
  t.count = 127;
  for (let i = 0; i < 127; i++) t.sprites[i] = { width: 2, height: 1, size: 2, data: new Uint8Array([5, 5]) };
  return [t, t, t, emptySpriteTable(), emptySpriteTable(), emptySpriteTable(), emptySpriteTable(), emptySpriteTable()];
}

describe('fonts', () => {
  it('FONT_ASCII maps letters like the C table', () => {
    expect(FONT_ASCII['A'.charCodeAt(0)]).toBe(0);
    expect(FONT_ASCII['a'.charCodeAt(0)]).toBe(34);
    expect(FONT_ASCII['0'.charCodeAt(0)]).toBe(79);
    expect(FONT_ASCII['~'.charCodeAt(0)]).toBe(-1);
    expect(FONT_ASCII[0x80]).toBe(86);
  });
  it('textWidth: glyph width + 1, space = 6, unknown chars = 0', () => {
    const t = fakeTables();
    expect(textWidth('AB C', t, Font.Normal)).toBe(3 + 3 + 6 + 3);
    expect(textWidth('~', t, Font.Normal)).toBe(0);
    expect(fontCenter('AB', t, Font.Normal)).toBe(160 - 3);
  });
  it('drawFontHv centers and toggles +4 brightness on ~', () => {
    const t = fakeTables();
    const s = createSurface();
    drawFontHv(s, t, 100, 0, 'A~A', Font.Normal, Align.Centered, 1, 0);
    // width 6 → starts at x=97
    expect([s.pixels[97], s.pixels[100]]).toEqual([0x15, 0x19]);
  });
  it('dString draws a dark shadow at +2,+2 and hue 15 at brightness -3', () => {
    const t = fakeTables();
    const s = createSurface();
    s.pixels.fill(0x2e);
    dString(s, t, 10, 10, 'A', Font.Normal);
    expect(s.pixels[10 * 320 + 10]).toBe(0xf2);   // 0xf0 | (5 - 3)
    expect(s.pixels[12 * 320 + 12]).toBe(0x27);   // shadow: 0x20 | (0xe / 2)
  });
});

describeData('real fonts', () => {
  it('menu item widths are stable', () => {
    const tables = loadMainShapeTables(testArchive!.get('tyrian.shp')).tables;
    expect(textWidth('Start New Game', tables, Font.Normal)).toBeGreaterThan(50);
    expect(textWidth('Quit', tables, Font.Normal)).toBeLessThan(textWidth('Start New Game', tables, Font.Normal));
  });
});
```

Run: `pnpm test test/video/font.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement `src/video/fonthand.ts`** (port of `fonthand.c`: `font_ascii`, `JE_dString`, `JE_fontCenter`, `JE_textWidth`, `JE_textShade`, `JE_outText`, `JE_outTextModify`, `JE_outTextAdjust`, `JE_outTextAndDarken`)

```ts
import type { Surface } from './surface';
import {
  TINY_FONT, blitSpriteDark, blitSpriteHv, blitSpriteHvBlend, blitSpriteHvUnsafe, spriteExists, type SpriteTable,
} from './sprite';

type Tables = readonly SpriteTable[];

export const PART_SHADE = 0;
export const FULL_SHADE = 1;
export const DARKEN = 2;
export const TRICK = 3;

// port of font_ascii — copy the 256 values verbatim from fonthand.c
export const FONT_ASCII = new Int16Array([
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, 26, 33, 60, 61, 62, -1, 32, 64, 65, 63, 84, 29, 83, 28, 80,
  79, 70, 71, 72, 73, 74, 75, 76, 77, 78, 31, 30, -1, 85, -1, 27,
  -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 68, 82, 69, -1, -1,
  -1, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
  49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 66, 81, 67, -1, -1,
  86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101,
  102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117,
  118, 119, 120, 121, 122, 123, 124, 125, 126, -1, -1, -1, -1, -1, -1, -1,
  ...new Array(5 * 16).fill(-1),
]);

const glyph = (c: string): number => FONT_ASCII[c.charCodeAt(0) & 0xff]!;
const width = (t: SpriteTable, id: number): number => t.sprites[id]!.width;

// port of JE_dString
export function dString(s: Surface, tables: Tables, x: number, y: number, text: string, font: number): void {
  const defaultBrightness = -3;
  let bright = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (ch === '~') bright = bright === 0 ? 2 : 0;
    else if (id !== -1) {
      blitSpriteDark(s, x + 2, y + 2, tables[font]!, id, false);
      blitSpriteHvUnsafe(s, x, y, tables[font]!, id, 0xf, defaultBrightness + bright);
      x += width(tables[font]!, id) + 1;
    }
  }
}

// port of JE_textWidth
export function textWidth(text: string, tables: Tables, font: number): number {
  let x = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (id !== -1) x += width(tables[font]!, id) + 1;
  }
  return x;
}

// port of JE_fontCenter
export function fontCenter(text: string, tables: Tables, font: number): number {
  return 160 - Math.trunc(textWidth(text, tables, font) / 2);
}

// port of JE_outText
export function outText(s: Surface, tables: Tables, x: number, y: number, text: string, colorbank: number, brightness: number): void {
  const t = tables[TINY_FONT]!;
  let bright = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (ch === '~') bright = bright === 0 ? 4 : 0;
    else if (id !== -1 && spriteExists(t, id)) {
      if (brightness >= 0) blitSpriteHvUnsafe(s, x, y, t, id, colorbank, brightness + bright);
      else blitSpriteDark(s, x, y, t, id, true);
      x += width(t, id) + 1;
    }
  }
}

// port of JE_outTextModify
export function outTextModify(s: Surface, tables: Tables, x: number, y: number, text: string, filter: number, brightness: number, font: number): void {
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (id !== -1) {
      blitSpriteHvBlend(s, x, y, tables[font]!, id, filter, brightness);
      x += width(tables[font]!, id) + 1;
    }
  }
}

// port of JE_outTextAdjust (note: the C checks spriteExists against TINY_FONT, not `font` — keep it)
export function outTextAdjust(s: Surface, tables: Tables, x: number, y: number, text: string, filter: number, brightness: number, font: number, shadow: boolean): void {
  let bright = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (ch === '~') bright = bright === 0 ? 4 : 0;
    else if (id !== -1 && spriteExists(tables[TINY_FONT]!, id)) {
      if (shadow) blitSpriteDark(s, x + 2, y + 2, tables[font]!, id, false);
      blitSpriteHv(s, x, y, tables[font]!, id, filter, brightness + bright);
      x += width(tables[font]!, id) + 1;
    }
  }
}

// port of JE_outTextAndDarken (same TINY_FONT existence check quirk)
export function outTextAndDarken(s: Surface, tables: Tables, x: number, y: number, text: string, colorbank: number, brightness: number, font: number): void {
  let bright = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (ch === '~') bright = bright === 0 ? 4 : 0;
    else if (id !== -1 && spriteExists(tables[TINY_FONT]!, id)) {
      blitSpriteDark(s, x + 1, y + 1, tables[font]!, id, false);
      blitSpriteHvUnsafe(s, x, y, tables[font]!, id, colorbank, brightness + bright);
      x += width(tables[font]!, id) + 1;
    }
  }
}

// port of JE_textShade
export function textShade(s: Surface, tables: Tables, x: number, y: number, text: string, colorbank: number, brightness: number, shadetype: number): void {
  switch (shadetype) {
    case PART_SHADE:
      outText(s, tables, x + 1, y + 1, text, 0, -1);
      outText(s, tables, x, y, text, colorbank, brightness);
      break;
    case FULL_SHADE:
      outText(s, tables, x - 1, y, text, 0, -1);
      outText(s, tables, x + 1, y, text, 0, -1);
      outText(s, tables, x, y - 1, text, 0, -1);
      outText(s, tables, x, y + 1, text, 0, -1);
      outText(s, tables, x, y, text, colorbank, brightness);
      break;
    case DARKEN:
      outTextAndDarken(s, tables, x + 1, y + 1, text, colorbank, brightness, TINY_FONT);
      break;
    case TRICK:
      outTextModify(s, tables, x, y, text, colorbank, brightness, TINY_FONT);
      break;
  }
}
```

Check `FONT_ASCII.length === 256` in the test file if you change the table literal
(add `expect(FONT_ASCII.length).toBe(256)` to the first test).

- [ ] **Step 3: Implement `src/video/font.ts`** (port of `font.c`)

```ts
import { s8 } from '../core/int';
import { FONT_ASCII, textWidth } from './fonthand';
import { blitSpriteDark, blitSpriteHv, blitSpriteHvBlend, spriteExists, type SpriteTable } from './sprite';
import type { Surface } from './surface';

export { FONT_ASCII };
type Tables = readonly SpriteTable[];

export enum Font { Large = 0, Normal = 1, Small = 2 }
export enum Align { Left, Centered, Right }

function alignX(x: number, text: string, tables: Tables, font: Font, align: Align): number {
  if (align === Align.Centered) return x - Math.trunc(textWidth(text, tables, font) / 2);
  if (align === Align.Right) return x - textWidth(text, tables, font);
  return x;
}

// port of draw_font_hv
export function drawFontHv(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, hue: number, value: number): void {
  x = alignX(x, text, tables, font, align);
  const t = tables[font]!;
  let highlight = false;
  for (const ch of text) {
    const id = FONT_ASCII[ch.charCodeAt(0) & 0xff]!;
    if (ch === ' ') x += 6;
    else if (ch === '~') {
      highlight = !highlight;
      value = s8(highlight ? value + 4 : value - 4);
    } else if (id !== -1 && spriteExists(t, id)) {
      blitSpriteHv(s, x, y, t, id, hue, value);
      x += t.sprites[id]!.width + 1;
    }
  }
}

// port of draw_font_hv_blend
export function drawFontHvBlend(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, hue: number, value: number): void {
  x = alignX(x, text, tables, font, align);
  const t = tables[font]!;
  for (const ch of text) {
    const id = FONT_ASCII[ch.charCodeAt(0) & 0xff]!;
    if (ch === ' ') x += 6;
    else if (ch === '~') { /* not drawn */ }
    else if (id !== -1 && spriteExists(t, id)) {
      blitSpriteHvBlend(s, x, y, t, id, hue, value);
      x += t.sprites[id]!.width + 1;
    }
  }
}

// port of draw_font_dark
export function drawFontDark(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, black: boolean): void {
  x = alignX(x, text, tables, font, align);
  const t = tables[font]!;
  for (const ch of text) {
    const id = FONT_ASCII[ch.charCodeAt(0) & 0xff]!;
    if (ch === ' ') x += 6;
    else if (ch === '~') { /* not drawn */ }
    else if (id !== -1 && spriteExists(t, id)) {
      blitSpriteDark(s, x, y, t, id, black);
      x += t.sprites[id]!.width + 1;
    }
  }
}

// port of draw_font_hv_shadow
export function drawFontHvShadow(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, hue: number, value: number, black: boolean, shadowDist: number): void {
  drawFontDark(s, tables, x + shadowDist, y + shadowDist, text, font, align, black);
  drawFontHv(s, tables, x, y, text, font, align, hue, value);
}

// port of draw_font_hv_full_shadow
export function drawFontHvFullShadow(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, hue: number, value: number, black: boolean, shadowDist: number): void {
  drawFontDark(s, tables, x, y - shadowDist, text, font, align, black);
  drawFontDark(s, tables, x + shadowDist, y, text, font, align, black);
  drawFontDark(s, tables, x, y + shadowDist, text, font, align, black);
  drawFontDark(s, tables, x - shadowDist, y, text, font, align, black);
  drawFontHv(s, tables, x, y, text, font, align, hue, value);
}
```

Run: `pnpm test test/video/font.test.ts` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/video/font.ts src/video/fonthand.ts test/video/font.test.ts
git commit -m "feat: font drawing (font.c, fonthand.c text routines)

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 10: Help text (`tyrian.hdt`)

**Files:**
- Create: `src/data/helptext.ts`
- Test: `test/data/helptext.test.ts`

**Interfaces:**
- Consumes: `BinaryReader`.
- Produces: `decryptString(bytes: Uint8Array): Uint8Array` (returns a decrypted copy);
  `interface HelpText { episode1DataLoc: number; endPos: number; helpTxt: string[]; pName: string[]; miscText: string[]; miscTextB: string[]; menuInt: string[][] /* 16 × 11 */; menuText: string[]; outputs: string[]; topicName: string[]; mainMenuHelp: string[]; inGameText: string[]; detailLevel: string[]; gameSpeedText: string[]; episodeName: string[]; difficultyName: string[]; gameplayName: string[]; inputDevices: string[]; networkText: string[]; difficultyNameB: string[]; joyButtonNames: string[]; superShips: string[]; specialName: string[]; destructHelp: string[]; weaponNames: string[]; destructModeName: string[]; shipInfo: [string, string][]; timedBattleName: string[]; licensingInfo: string[]; defaultHighScoreNames: string[]; defaultTeamNames: string[]; orderingInfo: string[]; superTyrianText: string[] }`;
  `loadHelpText(bytes: Uint8Array): HelpText` (port of `JE_loadHelpText`).

Encryption (port of `decrypt_string`): for `i` from `len-1` down to `0`:
`s[i] ^= key[i % 10]`; then, if `i > 0`, `s[i] ^= s[i-1]` (the previous byte is still
encrypted at that point). Key `[204, 129, 63, 255, 71, 19, 25, 62, 1, 99]`. Each read is a
pascal string (`u8 len`, bytes) truncated to `size - 1` characters, where `size` is the C
array's second dimension (listed below). Every section is: skip one pascal string (header),
read N strings, skip one (footer) — except the last section (superTyrianText) which has no
footer, and the 10 "setup" sections which are skipped entirely (`skip header, skip n, skip footer`
with n = `[10, 5, 4, 4, 5, 7, 7, 21, 3, 3]`).

Section order (name, count, size) — taken from `helptext.c` and verified against the data:
helpTxt 39/231; pName 21/16; miscText 72/42; miscTextB 8/12; menuInt[6] 11/18;
menuText 7/29 (then the OpenTyrian2000 override: `menuText[6]=menuText[5]; menuText[5]=menuText[4]; menuText[4]="Setup"`);
outputs 9/31; topicName 6/21; mainMenuHelp 37/66; menuInt[1] 7/18; menuInt[2] 9/18; menuInt[3] 9/18;
inGameText 6/21; detailLevel 6/13; gameSpeedText 5/13; episodeName 6/31; difficultyName 7/21; gameplayName 6/26;
menuInt[10] 6/18; inputDevices 3/13; networkText 5/33; menuInt[11] 4/18; difficultyNameB 11/21; menuInt[12] 7/18; menuInt[13] 7/18;
joyButtonNames 5/21; superShips 13/26; specialName 11/10; destructHelp 25/22; weaponNames 17/17; destructModeName 5/13;
shipInfo 20 pairs/256; menuInt[14] 5/18; timedBattleName 4/23; [setup skips]; menuInt[15] 6/18; licensingInfo 3/46;
defaultHighScoreNames 39/23; defaultTeamNames 10/25; orderingInfo 6/32; superTyrianText 6/64 (no footer).
The file starts with `s32 episode1DataLoc`; after the last read the reader position must equal it (21174 for Tyrian 2000).

- [ ] **Step 1: Failing tests**

`test/data/helptext.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decryptString, loadHelpText } from '../../src/data/helptext';
import { describeData, testArchive } from '../helpers/data';

const KEY = [204, 129, 63, 255, 71, 19, 25, 62, 1, 99];
function encrypt(plain: string): Uint8Array {
  const s = Uint8Array.from(plain, (c) => c.charCodeAt(0));
  // inverse of decrypt: walk forward; e[i] = p[i] ^ key[i%10] ^ e[i-1]
  const e = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) e[i] = s[i]! ^ KEY[i % 10]! ^ (i > 0 ? e[i - 1]! : 0);
  return e;
}

describe('decryptString', () => {
  it('inverts the Tyrian string cipher', () => {
    const text = 'Start New Game ~ 0123456789!';
    expect(String.fromCharCode(...decryptString(encrypt(text)))).toBe(text);
  });
  it('handles empty strings', () => {
    expect(decryptString(new Uint8Array()).length).toBe(0);
  });
});

describeData('real tyrian.hdt', () => {
  const h = () => loadHelpText(testArchive!.get('tyrian.hdt'));
  it('parses to exactly episode1DataLoc', () => {
    const t = h();
    expect(t.episode1DataLoc).toBe(21174);
    expect(t.endPos).toBe(t.episode1DataLoc);
  });
  it('main menu matches OpenTyrian2000 (with Setup override)', () => {
    expect(h().menuText).toEqual(['Start New Game', 'Load Game', 'High Scores', 'Instructions', 'Setup', 'Demo', 'Quit']);
  });
  it('other known sections', () => {
    const t = h();
    expect(t.pName[0]).toBe('Tyrian');
    expect(t.pName[20]).toBe('Skip It');
    expect(t.specialName).toEqual(['STEALTH', 'STORMWIND', 'TECHNO', 'ENEMY', 'WEIRD', 'UNKNOWN', 'NORTSHIPZ', 'LIZARD', 'PRETZEL', 'DESTRUCT', 'ENGAGE']);
    expect(t.episodeName[1]).toBe('Episode 1: Escape');
    expect(t.difficultyName[6]).toBe('Lord of Game');
    expect(t.superShips[12]).toBe('Stalker 21.126');
    expect(t.superTyrianText[5]).toBe('Prepare to play...');
    expect(t.miscTextB).toEqual(['Ep', 'Episode', 'Last Level', 'got', 'SUPER', 'POWER:', 'Time Bonus', 'Lives Bonus']);
    expect(t.menuInt).toHaveLength(16);
    expect(t.shipInfo).toHaveLength(20);
  });
});
```

Run: `pnpm test test/data/helptext.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement `src/data/helptext.ts`** (port of `helptext.c` loading code)

```ts
import { BinaryReader } from '../core/binary-reader';

const CRYPT_KEY = [204, 129, 63, 255, 71, 19, 25, 62, 1, 99];

// port of decrypt_string
export function decryptString(bytes: Uint8Array): Uint8Array {
  const s = bytes.slice();
  for (let i = s.length - 1; i >= 0; --i) {
    s[i] = s[i]! ^ CRYPT_KEY[i % CRYPT_KEY.length]!;
    if (i > 0) s[i] = s[i]! ^ s[i - 1]!;
  }
  return s;
}

// port of read_encrypted_pascal_string
function readEncrypted(r: BinaryReader, size: number): string {
  const len = r.u8();
  const plain = decryptString(r.bytes(len));
  return String.fromCharCode(...plain.subarray(0, Math.min(len, size - 1)));
}

// port of skip_pascal_string
function skip(r: BinaryReader): void {
  r.skip(r.u8());
}

export interface HelpText {
  episode1DataLoc: number; endPos: number;
  helpTxt: string[]; pName: string[]; miscText: string[]; miscTextB: string[];
  menuInt: string[][]; menuText: string[]; outputs: string[]; topicName: string[]; mainMenuHelp: string[];
  inGameText: string[]; detailLevel: string[]; gameSpeedText: string[];
  episodeName: string[]; difficultyName: string[]; gameplayName: string[];
  inputDevices: string[]; networkText: string[]; difficultyNameB: string[]; joyButtonNames: string[];
  superShips: string[]; specialName: string[]; destructHelp: string[]; weaponNames: string[]; destructModeName: string[];
  shipInfo: [string, string][]; timedBattleName: string[]; licensingInfo: string[];
  defaultHighScoreNames: string[]; defaultTeamNames: string[]; orderingInfo: string[]; superTyrianText: string[];
}

// port of JE_loadHelpText
export function loadHelpText(bytes: Uint8Array): HelpText {
  const r = new BinaryReader(bytes);
  const episode1DataLoc = r.s32();
  const section = (count: number, size: number, footer = true): string[] => {
    skip(r);
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(readEncrypted(r, size));
    if (footer) skip(r);
    return out;
  };
  const menuInt: string[][] = Array.from({ length: 16 }, () => new Array<string>(11).fill(''));
  const menuIntSection = (n: number, count: number): void => {
    section(count, 18).forEach((s, i) => (menuInt[n]![i] = s));
  };

  const helpTxt = section(39, 231);
  const pName = section(21, 16);
  const miscText = section(72, 42);
  const miscTextB = section(8, 12);
  menuIntSection(6, 11); // key names
  const menuText = section(7, 29);
  menuText[6] = menuText[5]!; // OpenTyrian2000 override
  menuText[5] = menuText[4]!;
  menuText[4] = 'Setup';
  const outputs = section(9, 31);
  const topicName = section(6, 21);
  const mainMenuHelp = section(37, 66);
  menuIntSection(1, 7);
  menuIntSection(2, 9);
  menuIntSection(3, 9);
  const inGameText = section(6, 21);
  const detailLevel = section(6, 13);
  const gameSpeedText = section(5, 13);
  const episodeName = section(6, 31);
  const difficultyName = section(7, 21);
  const gameplayName = section(6, 26);
  menuIntSection(10, 6);
  const inputDevices = section(3, 13);
  const networkText = section(5, 33);
  menuIntSection(11, 4);
  const difficultyNameB = section(11, 21);
  menuIntSection(12, 7);
  menuIntSection(13, 7);
  const joyButtonNames = section(5, 21);
  const superShips = section(13, 26);
  const specialName = section(11, 10);
  const destructHelp = section(25, 22);
  const weaponNames = section(17, 17);
  const destructModeName = section(5, 13);
  skip(r);
  const shipInfo: [string, string][] = [];
  for (let i = 0; i < 20; i++) shipInfo.push([readEncrypted(r, 256), readEncrypted(r, 256)]);
  skip(r);
  menuIntSection(14, 5);
  const timedBattleName = section(4, 23);
  for (const n of [10, 5, 4, 4, 5, 7, 7, 21, 3, 3]) {
    skip(r);
    for (let i = 0; i < n; i++) skip(r);
    skip(r);
  }
  menuIntSection(15, 6);
  const licensingInfo = section(3, 46);
  const defaultHighScoreNames = section(39, 23);
  const defaultTeamNames = section(10, 25);
  const orderingInfo = section(6, 32);
  const superTyrianText = section(6, 64, false);

  return {
    episode1DataLoc, endPos: r.pos,
    helpTxt, pName, miscText, miscTextB, menuInt, menuText, outputs, topicName, mainMenuHelp,
    inGameText, detailLevel, gameSpeedText, episodeName, difficultyName, gameplayName,
    inputDevices, networkText, difficultyNameB, joyButtonNames, superShips, specialName,
    destructHelp, weaponNames, destructModeName, shipInfo, timedBattleName, licensingInfo,
    defaultHighScoreNames, defaultTeamNames, orderingInfo, superTyrianText,
  };
}
```

Run: `pnpm test test/data/helptext.test.ts` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/data/helptext.ts test/data/helptext.test.ts
git commit -m "feat: tyrian.hdt help text loader

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 11: Platform — clocks, delay timer, input state, audio interface

**Files:**
- Create: `src/platform/clock.ts`, `src/platform/delay.ts`, `src/platform/scancodes.ts`, `src/platform/input.ts`, `src/platform/audio.ts`
- Test: `test/platform/clock.test.ts`, `test/platform/delay.test.ts`, `test/platform/input.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `clock.ts`: `interface Clock { now(): number; sleep(ms: number): Promise<void> }`;
    `class BrowserClock implements Clock` (integer ms from `performance.now()`, `sleep` via `setTimeout`);
    `class VirtualClock implements Clock { constructor(limitMs?: number /*default 3_600_000*/); now(); sleep(ms); advance(ms: number): void }` — `sleep` advances virtual time instantly and resolves on a microtask; throws `Error('VirtualClock limit exceeded …')` past `limitMs`.
  - `delay.ts`: `PIT_PERIOD_MS`, `DEFAULT_DELAY_SPEED = 0x4300`, `SDL_POLL_INTERVAL = 10`;
    `class DelayTimer { constructor(clock: Clock); setDelay(d: number): void; setDelay2(d: number): void; getDelayTicks(): number; getDelayTicks2(): number; remaining(): number; setDelaySpeed(speed: number): void }`.
  - `scancodes.ts`: `enum Scancode { … }` (SDL values), `scancodeFromCode(code: string): Scancode | undefined`, `KMOD_*` constants.
  - `input.ts`: `type InputEvent = { type: 'keydown'; scancode: number; mod: number } | { type: 'keyup'; scancode: number } | { type: 'mousemove'; x: number; y: number; moved: boolean } | { type: 'mousedown'; button: number; x: number; y: number } | { type: 'mouseup'; button: number; x: number; y: number } | { type: 'text'; text: string }`;
    `SDL_BUTTON_LEFT = 1, SDL_BUTTON_MIDDLE = 2, SDL_BUTTON_RIGHT = 3`;
    `class Input { keysactive: Uint8Array; newkey; keydown; lastkeyScan; lastkeyMod; newmouse; mousedown; lastmouseBut; lastmouseX; lastmouseY; mouseX; mouseY; newText; lastText; mouseInactive: boolean; push(e: InputEvent): void; serviceEvents(clearNew: boolean): void; releaseAll(): void }`.
  - `audio.ts`: `interface Audio { playSample(n: number): void; playSong(n: number): void; stopSong(): void; setVolume(music: number, sample: number): void }`; `class NullAudio implements Audio`;
    sound ids `S_SELECT = 8, S_SPRING = 16, S_CLINK = 23, S_CURSOR = 28, V_DANGER = 37`; `SONG_TITLE = 29`.

`serviceEvents` is a port of `service_SDL_events` and **must keep its quirk**: it processes
queued events in order, and **returns immediately after handling one keydown or one
keyup** (mouse and text events do not stop it). On keydown: `keysactive[sc]=1; newkey=true;
lastkeyScan=sc; lastkeyMod=mod; keydown=true; mouseInactive=true`. On keyup:
`keysactive[sc]=0; keydown=false`. Mouse motion sets `mouseX/mouseY`, and if `moved`
sets `mouseInactive=false`. Mouse down: `mouseInactive=false; newmouse=true;
lastmouseBut=button; lastmouseX/Y=x/y; mousedown=true` (also updates `mouseX/Y`). Mouse up:
`mousedown=false`. Text: `lastText=text; newText=true`. With `clearNew`, first reset
`newkey=newmouse=newText=false`. (Alt+Enter is handled by the DOM layer, Task 13.)
`mouse_pressed[]` / `mouseSettings` (gameplay) are out of scope.

- [ ] **Step 1: Failing tests**

`test/platform/clock.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/platform/clock';

describe('VirtualClock', () => {
  it('sleep advances time instantly', async () => {
    const c = new VirtualClock();
    expect(c.now()).toBe(0);
    await c.sleep(16);
    await c.sleep(4);
    expect(c.now()).toBe(20);
  });
  it('throws once the limit is exceeded (guards against hung tests)', async () => {
    const c = new VirtualClock(100);
    await c.sleep(100);
    await expect(c.sleep(1)).rejects.toThrow(/limit exceeded/);
  });
});
```

`test/platform/delay.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/platform/clock';
import { DelayTimer, PIT_PERIOD_MS } from '../../src/platform/delay';

describe('DelayTimer (port of setDelay/getDelayTicks)', () => {
  it('one delay unit is 0x4300 PIT ticks ≈ 14.375 ms, truncated to whole ms', async () => {
    const c = new VirtualClock();
    const d = new DelayTimer(c);
    expect(0x4300 * PIT_PERIOD_MS).toBeCloseTo(14.375, 3);
    d.setDelay(1);
    expect(d.getDelayTicks()).toBe(14);
    d.setDelay(200);
    expect(d.getDelayTicks()).toBe(2875);
    await c.sleep(3000);
    expect(d.getDelayTicks()).toBe(0);
    expect(d.remaining()).toBeLessThan(0);
  });
  it('setDelaySpeed changes the period', () => {
    const d = new DelayTimer(new VirtualClock());
    d.setDelaySpeed(0x4300 / 2);
    d.setDelay(2);
    expect(d.getDelayTicks()).toBe(14);
  });
});
```

`test/platform/input.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Input, SDL_BUTTON_LEFT } from '../../src/platform/input';
import { Scancode, scancodeFromCode } from '../../src/platform/scancodes';

describe('scancodes', () => {
  it('maps KeyboardEvent.code to SDL scancodes', () => {
    expect(scancodeFromCode('KeyA')).toBe(4);
    expect(scancodeFromCode('Digit0')).toBe(39);
    expect(scancodeFromCode('Enter')).toBe(40);
    expect(scancodeFromCode('Space')).toBe(44);
    expect(scancodeFromCode('ArrowDown')).toBe(Scancode.Down);
    expect(Scancode.Down).toBe(81);
    expect(scancodeFromCode('ScrollLock')).toBe(71);
    expect(scancodeFromCode('ControlLeft')).toBe(224);
    expect(scancodeFromCode('Nonsense')).toBeUndefined();
  });
});

describe('Input.serviceEvents (port of service_SDL_events)', () => {
  it('returns after one key event, leaving the rest queued', () => {
    const i = new Input();
    i.push({ type: 'keydown', scancode: 81, mod: 0 });
    i.push({ type: 'keyup', scancode: 81 });
    i.serviceEvents(false);
    expect([i.newkey, i.keydown, i.lastkeyScan, i.keysactive[81]]).toEqual([true, true, 81, 1]);
    i.serviceEvents(true);
    expect([i.newkey, i.keydown, i.keysactive[81]]).toEqual([false, false, 0]);
  });
  it('processes all mouse/text events before a key event in one call', () => {
    const i = new Input();
    i.push({ type: 'mousemove', x: 10, y: 20, moved: true });
    i.push({ type: 'text', text: 'e' });
    i.push({ type: 'mousedown', button: SDL_BUTTON_LEFT, x: 11, y: 21 });
    i.serviceEvents(false);
    expect([i.mouseX, i.mouseY, i.newText, i.lastText, i.newmouse, i.mousedown, i.lastmouseX, i.mouseInactive])
      .toEqual([11, 21, true, 'e', true, true, 11, false]);
  });
  it('keydown makes the mouse inactive', () => {
    const i = new Input();
    i.mouseInactive = false;
    i.push({ type: 'keydown', scancode: 4, mod: 0 });
    i.serviceEvents(false);
    expect(i.mouseInactive).toBe(true);
  });
  it('releaseAll queues keyups for held keys', () => {
    const i = new Input();
    i.push({ type: 'keydown', scancode: 79, mod: 0 });
    i.serviceEvents(false);
    i.releaseAll();
    i.serviceEvents(false);
    expect([i.keydown, i.keysactive[79]]).toEqual([false, 0]);
  });
});
```

Run: `pnpm test test/platform` — Expected: FAIL.

- [ ] **Step 2: Implement clock + delay**

`src/platform/clock.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Replaces SDL_GetTicks / SDL_Delay.
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export class BrowserClock implements Clock {
  now(): number {
    return Math.floor(performance.now());
  }
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }
}

export class VirtualClock implements Clock {
  private t = 0;
  constructor(private readonly limitMs = 3_600_000) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += Math.max(0, Math.ceil(ms));
    if (this.t > this.limitMs) throw new Error(`VirtualClock limit exceeded (${this.limitMs} ms) — is the game waiting for input that never comes?`);
  }
  async sleep(ms: number): Promise<void> {
    this.advance(ms);
  }
}
```

`src/platform/delay.ts` (port of the timing half of `nortsong.c`):
```ts
import type { Clock } from './clock';

/** Period of the x86 PIT in milliseconds. */
export const PIT_PERIOD_MS = (12 / 14318180) * 1000;
export const DEFAULT_DELAY_SPEED = 0x4300;
export const SDL_POLL_INTERVAL = 10;

const f32 = Math.fround;

export class DelayTimer {
  private target = 0;
  private target2 = 0;
  private delayPeriod = f32(DEFAULT_DELAY_SPEED * f32(PIT_PERIOD_MS));

  constructor(private readonly clock: Clock) {}

  // C: target = SDL_GetTicks() + delay * delayPeriod (float math, stored to Uint32)
  private targetFor(d: number): number {
    return Math.trunc(f32(this.clock.now() + f32(d * this.delayPeriod)));
  }
  setDelay(d: number): void { this.target = this.targetFor(d); }   // port of setDelay
  setDelay2(d: number): void { this.target2 = this.targetFor(d); } // port of setDelay2
  getDelayTicks(): number { return Math.max(0, this.target - this.clock.now()); }
  getDelayTicks2(): number { return Math.max(0, this.target2 - this.clock.now()); }
  /** Signed ms until the setDelay target (≤ 0 means elapsed). */
  remaining(): number { return this.target - this.clock.now(); }
  // port of setDelaySpeed
  setDelaySpeed(speed: number): void { this.delayPeriod = f32(speed * f32(PIT_PERIOD_MS)); }
}
```

- [ ] **Step 3: Scancodes**

`src/platform/scancodes.ts` — SDL2 scancode numbers (`SDL_scancode.h`):
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
export enum Scancode {
  A = 4, Return = 40, Escape = 41, Backspace = 42, Tab = 43, Space = 44,
  F1 = 58, F12 = 69, PrintScreen = 70, ScrollLock = 71, Pause = 72,
  Insert = 73, Home = 74, PageUp = 75, Delete = 76, End = 77, PageDown = 78,
  Right = 79, Left = 80, Down = 81, Up = 82,
  LCtrl = 224, LShift = 225, LAlt = 226, LGui = 227, RCtrl = 228, RShift = 229, RAlt = 230, RGui = 231,
}

export const KMOD_LSHIFT = 0x0001, KMOD_RSHIFT = 0x0002, KMOD_LCTRL = 0x0040, KMOD_RCTRL = 0x0080,
  KMOD_LALT = 0x0100, KMOD_RALT = 0x0200;

const TABLE: Record<string, number> = {
  Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44, Minus: 45, Equal: 46,
  BracketLeft: 47, BracketRight: 48, Backslash: 49, Semicolon: 51, Quote: 52, Backquote: 53,
  Comma: 54, Period: 55, Slash: 56, CapsLock: 57,
  PrintScreen: 70, ScrollLock: 71, Pause: 72, Insert: 73, Home: 74, PageUp: 75,
  Delete: 76, End: 77, PageDown: 78, ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81, ArrowUp: 82,
  NumLock: 83, NumpadDivide: 84, NumpadMultiply: 85, NumpadSubtract: 86, NumpadAdd: 87,
  NumpadEnter: 88, Numpad0: 98, NumpadDecimal: 99,
  ControlLeft: 224, ShiftLeft: 225, AltLeft: 226, MetaLeft: 227,
  ControlRight: 228, ShiftRight: 229, AltRight: 230, MetaRight: 231,
};
for (let i = 0; i < 26; i++) TABLE[`Key${String.fromCharCode(65 + i)}`] = 4 + i;
for (let i = 1; i <= 9; i++) TABLE[`Digit${i}`] = 29 + i;
TABLE['Digit0'] = 39;
for (let i = 1; i <= 12; i++) TABLE[`F${i}`] = 57 + i;
for (let i = 1; i <= 9; i++) TABLE[`Numpad${i}`] = 88 + i;

export function scancodeFromCode(code: string): number | undefined {
  return TABLE[code];
}
```

(The module-level `TABLE` is a constant lookup built once — allowed by the "no mutable
state" rule.)

- [ ] **Step 4: Input + audio**

`src/platform/input.ts` (port of `keyboard.c` state + `service_SDL_events`):
```ts
export const SDL_BUTTON_LEFT = 1;
export const SDL_BUTTON_MIDDLE = 2;
export const SDL_BUTTON_RIGHT = 3;

export type InputEvent =
  | { type: 'keydown'; scancode: number; mod: number }
  | { type: 'keyup'; scancode: number }
  | { type: 'mousemove'; x: number; y: number; moved: boolean }
  | { type: 'mousedown'; button: number; x: number; y: number }
  | { type: 'mouseup'; button: number; x: number; y: number }
  | { type: 'text'; text: string };

export class Input {
  readonly keysactive = new Uint8Array(512);
  newkey = false;
  keydown = false;
  lastkeyScan = 0;
  lastkeyMod = 0;
  newmouse = false;
  mousedown = false;
  lastmouseBut = 0;
  lastmouseX = 0;
  lastmouseY = 0;
  mouseX = 0;
  mouseY = 0;
  newText = false;
  lastText = '';
  mouseInactive = true; // mouse.c
  private readonly queue: InputEvent[] = [];

  push(e: InputEvent): void {
    this.queue.push(e);
  }

  /** SDL releases held keys when the window loses focus; the DOM does not. */
  releaseAll(): void {
    for (let sc = 0; sc < this.keysactive.length; sc++) {
      if (this.keysactive[sc]) this.push({ type: 'keyup', scancode: sc });
    }
  }

  // port of service_SDL_events
  serviceEvents(clearNew: boolean): void {
    if (clearNew) {
      this.newkey = false;
      this.newmouse = false;
      this.newText = false;
    }
    while (this.queue.length > 0) {
      const ev = this.queue.shift()!;
      switch (ev.type) {
        case 'keydown':
          this.keysactive[ev.scancode] = 1;
          this.newkey = true;
          this.lastkeyScan = ev.scancode;
          this.lastkeyMod = ev.mod;
          this.keydown = true;
          this.mouseInactive = true;
          return;
        case 'keyup':
          this.keysactive[ev.scancode] = 0;
          this.keydown = false;
          return;
        case 'mousemove':
          this.mouseX = ev.x;
          this.mouseY = ev.y;
          if (ev.moved) this.mouseInactive = false;
          break;
        case 'mousedown':
          this.mouseInactive = false;
          this.mouseX = ev.x;
          this.mouseY = ev.y;
          this.newmouse = true;
          this.lastmouseBut = ev.button;
          this.lastmouseX = ev.x;
          this.lastmouseY = ev.y;
          this.mousedown = true;
          break;
        case 'mouseup':
          this.mouseInactive = false;
          this.mouseX = ev.x;
          this.mouseY = ev.y;
          this.mousedown = false;
          break;
        case 'text':
          this.lastText = ev.text;
          this.newText = true;
          break;
      }
    }
  }
}
```

Before finalising, open `reference/opentyrian2000/src/keyboard.c` lines 139–281 and confirm
the mouse-button branch (it sets `mouse_x/y` from the button event and `mouseInactive=false`
for both down and up); adjust if it differs.

`src/platform/audio.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Sound ids from sndmast.h / musmast.h; real output arrives in Sub-project 2.
export const S_SELECT = 8;
export const S_SPRING = 16;
export const S_CLINK = 23;
export const S_CURSOR = 28;
export const V_DANGER = 37;
export const SONG_TITLE = 29;

export interface Audio {
  playSample(n: number): void;
  playSong(n: number): void;
  stopSong(): void;
  setVolume(music: number, sample: number): void;
}

export class NullAudio implements Audio {
  playSample(): void {}
  playSong(): void {}
  stopSong(): void {}
  setVolume(): void {}
}
```

Run: `pnpm test test/platform` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/platform test/platform
git commit -m "feat: clocks, delay timer, input state, scancodes, null audio

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 12: Ctx, assets, showVGA, waits, fades, presenter, mouse cursor

**Files:**
- Create: `src/assets.ts`, `src/ctx.ts`, `src/video/video.ts`, `src/video/presenter.ts`, `src/video/fade.ts`, `src/platform/wait.ts`, `src/video/mouse.ts`
- Test: `test/ctx.test.ts`, `test/video/fade.test.ts`, `test/platform/wait.test.ts`, `test/video/mouse.test.ts`, `test/video/presenter.test.ts`, `test/helpers/ctx.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–11.
- Produces:
  - `assets.ts`: `interface Assets { archive: DataArchive; palettes: Uint8Array[]; pics: PicFile; shapes: MainShapes; helpText: HelpText }`; `loadAssets(archive: DataArchive): Assets`.
  - `ctx.ts`: `interface GameState { versionString: string; moveTyrianLogoUp: boolean; xmas: boolean; playDemo: boolean; loadDestruct: boolean }`;
    `interface Ctx { clock; delay; input; audio; presenter: Presenter; frameSink: FrameSink | null; rng; palette: PaletteState; vga: { screen: Surface; screen2: Surface; gameScreen: Surface }; assets: Assets; shopSpriteSheet: Sprite2Sheet | null; mouse: MouseCursor; state: GameState }`;
    `type FrameSink = (screen: Surface, palette: Uint8Array) => void`;
    `createCtx(opts: { assets: Assets; clock: Clock; presenter: Presenter; audio?: Audio; versionString?: string; seed?: number }): Ctx`.
  - `presenter.ts`: `interface Presenter { present(screen: Surface, palette: PaletteState): void }`; `class NullPresenter`; `class CanvasPresenter { constructor(canvas: HTMLCanvasElement) }`; `buildLut(palette: Uint8Array, out: Uint32Array): void`.
  - `video.ts`: `showVGA(ctx: Ctx): void` (port of `JE_showVGA`).
  - `wait.ts`: `waitDelay(ctx)`, `waitDelayOrInput(ctx)`, `waitInput(ctx, keyboard, mouse, joystick)`, `waitNoInput(ctx, keyboard, mouse, joystick)` — all `Promise<void>`.
  - `fade.ts`: `fadePalette(ctx, colors: Uint8Array, steps, first, last)`, `fadeSolid(ctx, r, g, b, steps, first, last)`, `fadeBlack(ctx, steps)`, `fadeWhite(ctx, steps)` — all `Promise<void>`.
  - `mouse.ts`: `MOUSE_POINTER_NORMAL = 0 … MOUSE_POINTER_RIGHT = 4`; `interface MouseCursor { hasMouse: boolean; cursor: number; grabX: number; grabY: number; grab: Uint8Array /*24*28*/ }`; `createMouseCursor(): MouseCursor`; `mouseStart(ctx)`, `mouseStartFilter(ctx, filter)`, `mouseReplace(ctx)`.
  - `test/helpers/ctx.ts`: `testCtx(): Ctx | null` — real assets + `VirtualClock` + `NullPresenter`, seed 1, versionString `'oracle'`.

- [ ] **Step 1: Failing tests**

`test/helpers/ctx.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { loadAssets } from '../../src/assets';
import { createCtx, type Ctx } from '../../src/ctx';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import { testArchive } from './data';

export function testCtx(): Ctx | null {
  if (!testArchive) return null;
  return createCtx({
    assets: loadAssets(testArchive), clock: new VirtualClock(), presenter: new NullPresenter(),
    versionString: 'oracle', seed: 1,
  });
}
```

`test/ctx.test.ts`:
```ts
import { expect, it } from 'vitest';
import { describeData } from './helpers/data';
import { testCtx } from './helpers/ctx';

describeData('createCtx', () => {
  it('wires assets and blank screens; palette starts black', () => {
    const ctx = testCtx()!;
    expect(ctx.assets.palettes).toHaveLength(24);
    expect(ctx.vga.screen.pixels.length).toBe(64000);
    expect(ctx.palette.current.every((v) => v === 0)).toBe(true);
    expect(ctx.state.versionString).toBe('oracle');
    expect(ctx.rng.rand()).toBe(1791095845); // seeded with 1
  });
});
```

`test/video/fade.test.ts`:
```ts
import { expect, it } from 'vitest';
import { fadeBlack, fadePalette, fadeWhite } from '../../src/video/fade';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('fades', () => {
  it('present once per step and take ~1 delay unit per step', async () => {
    const ctx = testCtx()!;
    const frames: number[] = [];
    ctx.frameSink = (_s, pal) => frames.push(pal[0]!);
    const t0 = ctx.clock.now();
    await fadeWhite(ctx, 25);
    expect(frames).toHaveLength(25);
    expect(frames[24]).toBe(255);
    expect(ctx.clock.now() - t0).toBeGreaterThanOrEqual(25 * 14);
    await fadeBlack(ctx, 10);
    expect(frames).toHaveLength(35);
    expect(frames[34]).toBe(0);
  });
  it('fadePalette only touches [first,last]', async () => {
    const ctx = testCtx()!;
    const target = new Uint8Array(768).fill(200);
    await fadePalette(ctx, target, 5, 0, 239);
    expect(ctx.palette.current[239 * 3]).toBe(200);
    expect(ctx.palette.current[240 * 3]).toBe(0);
  });
});
```

`test/platform/wait.test.ts`:
```ts
import { expect, it } from 'vitest';
import { waitDelayOrInput, waitInput, waitNoInput } from '../../src/platform/wait';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('waits', () => {
  it('waitDelayOrInput returns early on a key and clears newkey', async () => {
    const ctx = testCtx()!;
    ctx.delay.setDelay(200);
    ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 });
    await waitDelayOrInput(ctx);
    expect(ctx.clock.now()).toBe(0);
    expect(ctx.input.newkey).toBe(false);
  });
  it('waitDelayOrInput waits the full delay without input', async () => {
    const ctx = testCtx()!;
    ctx.delay.setDelay(200);
    await waitDelayOrInput(ctx);
    expect(ctx.clock.now()).toBeGreaterThanOrEqual(2875);
  });
  it('waitInput / waitNoInput follow keydown state', async () => {
    const ctx = testCtx()!;
    ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 });
    await waitInput(ctx, true, true, true);
    expect(ctx.input.keydown).toBe(true);
    ctx.input.push({ type: 'keyup', scancode: 44 });
    await waitNoInput(ctx, true, true, true);
    expect(ctx.input.keydown).toBe(false);
  });
});
```

`test/video/mouse.test.ts`:
```ts
import { expect, it } from 'vitest';
import { mouseReplace, mouseStartFilter } from '../../src/video/mouse';
import { loadCompShapes } from '../../src/data/shapes';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('mouse cursor', () => {
  it('draws when active and restores the background exactly', () => {
    const ctx = testCtx()!;
    ctx.shopSpriteSheet = loadCompShapes(ctx.assets.archive, '1');
    ctx.vga.screen.pixels.fill(0x11);
    ctx.input.mouseInactive = false;
    ctx.input.mouseX = 100; ctx.input.mouseY = 100;
    mouseStartFilter(ctx, 0xf0);
    expect(ctx.vga.screen.pixels.some((v) => v !== 0x11)).toBe(true);
    mouseReplace(ctx);
    expect(ctx.vga.screen.pixels.every((v) => v === 0x11)).toBe(true);
  });
  it('never throws or writes outside the screen for out-of-range positions', () => {
    const ctx = testCtx()!;
    ctx.shopSpriteSheet = loadCompShapes(ctx.assets.archive, '1');
    ctx.input.mouseInactive = false;
    for (const [x, y] of [[-50, -50], [-5, 250], [400, 10], [319, 199], [0, 0]]) {
      ctx.input.mouseX = x!; ctx.input.mouseY = y!;
      expect(() => { mouseStartFilter(ctx, 0xf0); mouseReplace(ctx); }).not.toThrow();
      expect(ctx.vga.screen.pixels.length).toBe(64000);
    }
  });
});
```

`test/video/presenter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildLut } from '../../src/video/presenter';

describe('buildLut', () => {
  it('packs RGB as little-endian RGBA with opaque alpha', () => {
    const pal = new Uint8Array(768);
    pal[3] = 0x11; pal[4] = 0x22; pal[5] = 0x33;
    const lut = new Uint32Array(256);
    buildLut(pal, lut);
    expect(lut[1]).toBe(0xff332211);
    expect(lut[0]).toBe(0xff000000);
  });
});
```

Run: `pnpm test` — Expected: the new tests FAIL (modules missing).

- [ ] **Step 2: Assets, presenter, Ctx, showVGA**

`src/assets.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import type { DataArchive } from './data/archive';
import { loadHelpText, type HelpText } from './data/helptext';
import { loadPalettes } from './data/palette-file';
import { PicFile } from './data/pic';
import { loadMainShapeTables, type MainShapes } from './data/shapes';

export interface Assets {
  archive: DataArchive;
  palettes: Uint8Array[];
  pics: PicFile;
  shapes: MainShapes;
  helpText: HelpText;
}

/** Loads what main() loads before the title screen (xmas is always off). */
export function loadAssets(archive: DataArchive): Assets {
  return {
    archive,
    helpText: loadHelpText(archive.get('tyrian.hdt')),
    palettes: loadPalettes(archive.get('palette.dat')),
    shapes: loadMainShapeTables(archive.get('tyrian.shp')),
    pics: new PicFile(archive.get('tyrian.pic')),
  };
}
```

`src/video/presenter.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Replaces scale_and_flip: palette lookup + putImageData; CSS does the scaling.
import type { PaletteState } from './palette';
import type { Surface } from './surface';

export interface Presenter {
  present(screen: Surface, palette: PaletteState): void;
}

export class NullPresenter implements Presenter {
  present(): void {}
}

export function buildLut(palette: Uint8Array, out: Uint32Array): void {
  for (let i = 0; i < 256; i++) {
    out[i] = (0xff000000 | (palette[i * 3 + 2]! << 16) | (palette[i * 3 + 1]! << 8) | palette[i * 3]!) >>> 0;
  }
}

export class CanvasPresenter implements Presenter {
  private readonly ctx2d: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly out: Uint32Array;
  private readonly lut = new Uint32Array(256);
  private lutVersion = -1;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = 320;
    canvas.height = 200;
    this.ctx2d = canvas.getContext('2d', { alpha: false })!;
    this.image = this.ctx2d.createImageData(320, 200);
    this.out = new Uint32Array(this.image.data.buffer);
  }

  present(screen: Surface, palette: PaletteState): void {
    if (palette.version !== this.lutVersion) {
      buildLut(palette.current, this.lut);
      this.lutVersion = palette.version;
    }
    const px = screen.pixels, out = this.out, lut = this.lut;
    for (let i = 0; i < 64000; i++) out[i] = lut[px[i]!]!;
    this.ctx2d.putImageData(this.image, 0, 0);
  }
}
```

`src/ctx.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import type { Assets } from './assets';
import { MersenneTwister } from './core/mtrand';
import { NullAudio, type Audio } from './platform/audio';
import type { Clock } from './platform/clock';
import { DelayTimer } from './platform/delay';
import { Input } from './platform/input';
import { createMouseCursor, type MouseCursor } from './video/mouse';
import { PaletteState } from './video/palette';
import type { Presenter } from './video/presenter';
import type { Sprite2Sheet } from './video/sprite2';
import { createSurface, type Surface } from './video/surface';
import { VERSION } from './version';

export type FrameSink = (screen: Surface, palette: Uint8Array) => void;

export interface GameState {
  versionString: string;
  moveTyrianLogoUp: boolean;
  xmas: boolean;
  playDemo: boolean;
  loadDestruct: boolean;
}

export interface Ctx {
  clock: Clock;
  delay: DelayTimer;
  input: Input;
  audio: Audio;
  presenter: Presenter;
  frameSink: FrameSink | null;
  rng: MersenneTwister;
  palette: PaletteState;
  vga: { screen: Surface; screen2: Surface; gameScreen: Surface };
  assets: Assets;
  shopSpriteSheet: Sprite2Sheet | null;
  mouse: MouseCursor;
  state: GameState;
}

export function createCtx(opts: {
  assets: Assets; clock: Clock; presenter: Presenter; audio?: Audio; versionString?: string; seed?: number;
}): Ctx {
  const rng = new MersenneTwister();
  rng.srand(opts.seed ?? (Date.now() / 1000) >>> 0); // main(): mt_srand(time(NULL))
  return {
    clock: opts.clock,
    delay: new DelayTimer(opts.clock),
    input: new Input(),
    audio: opts.audio ?? new NullAudio(),
    presenter: opts.presenter,
    frameSink: null,
    rng,
    palette: new PaletteState(opts.assets.palettes),
    vga: { screen: createSurface(), screen2: createSurface(), gameScreen: createSurface() },
    assets: opts.assets,
    shopSpriteSheet: null,
    mouse: createMouseCursor(),
    state: { versionString: opts.versionString ?? VERSION, moveTyrianLogoUp: false, xmas: false, playDemo: false, loadDestruct: false },
  };
}
```

`src/video/video.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import type { Ctx } from '../ctx';

// port of JE_showVGA
export function showVGA(ctx: Ctx): void {
  ctx.frameSink?.(ctx.vga.screen, ctx.palette.current);
  ctx.presenter.present(ctx.vga.screen, ctx.palette);
}
```

- [ ] **Step 3: Waits and fades**

`src/platform/wait.ts` (ports from `nortsong.c` / `keyboard.c`; joysticks arrive in Sub-project 5, so `joydown` is always false):
```ts
import type { Ctx } from '../ctx';
import { SDL_POLL_INTERVAL } from './delay';

// port of service_wait_delay
export async function waitDelay(ctx: Ctx): Promise<void> {
  for (;;) {
    ctx.input.serviceEvents(false);
    const delay = ctx.delay.remaining();
    if (delay <= 0) return;
    await ctx.clock.sleep(Math.min(delay, SDL_POLL_INTERVAL));
  }
}

// port of wait_delayorinput
export async function waitDelayOrInput(ctx: Ctx): Promise<void> {
  for (;;) {
    ctx.input.serviceEvents(false);
    if (ctx.input.newkey || ctx.input.mousedown) {
      ctx.input.newkey = false;
      return;
    }
    const delay = ctx.delay.remaining();
    if (delay <= 0) return;
    await ctx.clock.sleep(Math.min(delay, SDL_POLL_INTERVAL));
  }
}

// port of wait_input
export async function waitInput(ctx: Ctx, keyboard: boolean, mouse: boolean, _joystick: boolean): Promise<void> {
  const i = ctx.input;
  i.serviceEvents(false);
  while (!((keyboard && i.keydown) || (mouse && i.mousedown))) {
    await ctx.clock.sleep(SDL_POLL_INTERVAL);
    i.serviceEvents(false);
  }
}

// port of wait_noinput
export async function waitNoInput(ctx: Ctx, keyboard: boolean, mouse: boolean, _joystick: boolean): Promise<void> {
  const i = ctx.input;
  i.serviceEvents(false);
  while ((keyboard && i.keydown) || (mouse && i.mousedown)) {
    await ctx.clock.sleep(SDL_POLL_INTERVAL);
    i.serviceEvents(false);
  }
}
```

`src/video/fade.ts` (port of the timed half of `palette.c`):
```ts
import type { Ctx } from '../ctx';
import { waitDelay } from '../platform/wait';
import { initStepFadePalette, initStepFadeSolid, stepFadePalette } from './palette';
import { showVGA } from './video';

// port of fade_palette
export async function fadePalette(ctx: Ctx, colors: Uint8Array, steps: number, first: number, last: number): Promise<void> {
  const diff = new Int32Array(768);
  initStepFadePalette(ctx.palette, diff, colors, first, last);
  for (; steps > 0; steps--) {
    ctx.delay.setDelay(1);
    stepFadePalette(ctx.palette, diff, steps, first, last);
    showVGA(ctx);
    await waitDelay(ctx);
  }
}

// port of fade_solid
export async function fadeSolid(ctx: Ctx, r: number, g: number, b: number, steps: number, first: number, last: number): Promise<void> {
  const diff = new Int32Array(768);
  initStepFadeSolid(ctx.palette, diff, r, g, b, first, last);
  for (; steps > 0; steps--) {
    ctx.delay.setDelay(1);
    stepFadePalette(ctx.palette, diff, steps, first, last);
    showVGA(ctx);
    await waitDelay(ctx);
  }
}

// port of fade_black / fade_white
export const fadeBlack = (ctx: Ctx, steps: number) => fadeSolid(ctx, 0, 0, 0, steps, 0, 255);
export const fadeWhite = (ctx: Ctx, steps: number) => fadeSolid(ctx, 255, 255, 255, steps, 0, 255);
```

Note: `fade_palette` is called with `colors` — the same array that `stepFadePalette`
never writes to — so passing `ctx.palette.colors` is safe.

- [ ] **Step 4: Mouse cursor** — `src/video/mouse.ts` (port of `mouse.c`)

```ts
import { u16 } from '../core/int';
import type { Ctx } from '../ctx';
import { blitSprite2x2Clip, blitSprite2x2FilterClip } from './sprite2';

export const MOUSE_POINTER_NORMAL = 0;
export const MOUSE_POINTER_UP = 1;
export const MOUSE_POINTER_DOWN = 2;
export const MOUSE_POINTER_LEFT = 3;
export const MOUSE_POINTER_RIGHT = 4;

interface PointerInfo { index: number; x: number; y: number; w: number; h: number; fx: number; fy: number }
const POINTERS: readonly PointerInfo[] = [
  { index: 273, x: 0, y: 0, w: 11, h: 16, fx: 0, fy: 0 },
  { index: 275, x: 0, y: 0, w: 21, h: 16, fx: 10, fy: 8 },
  { index: 277, x: 0, y: 0, w: 21, h: 16, fx: 10, fy: 7 },
  { index: 279, x: 0, y: 0, w: 16, h: 21, fx: 8, fy: 10 },
  { index: 281, x: 8, y: 0, w: 16, h: 21, fx: 7, fy: 10 },
];

export interface MouseCursor { hasMouse: boolean; cursor: number; grabX: number; grabY: number; grab: Uint8Array }

export function createMouseCursor(): MouseCursor {
  return { hasMouse: true, cursor: MOUSE_POINTER_NORMAL, grabX: 0, grabY: 0, grab: new Uint8Array(24 * 28) };
}

// port of JE_grabShapeTypeOne / JE_drawShapeTypeOne
function copyBlock(ctx: Ctx, toScreen: boolean): void {
  const scr = ctx.vga.screen, m = ctx.mouse;
  const limit = scr.h * scr.pitch;
  let s = m.grabY * scr.pitch + m.grabX, p = 0;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 24; x++) {
      if (s >= limit) return;
      if (toScreen) scr.pixels[s] = m.grab[p]!;
      else m.grab[p] = scr.pixels[s]!;
      s++; p++;
    }
    s += scr.pitch - 24;
  }
}

function grabPosition(ctx: Ctx, info: PointerInfo): void {
  const { mouseX, mouseY } = ctx.input;
  ctx.mouse.grabX = u16(Math.min(Math.max(info.fx, mouseX), 320 - (info.w - info.fx)) - info.fx);
  ctx.mouse.grabY = u16(Math.min(Math.max(info.fy, mouseY), 200 - (info.h - info.fy)) - info.fy);
}

// port of JE_mouseStart
export function mouseStart(ctx: Ctx): void {
  if (!ctx.mouse.hasMouse) return;
  ctx.input.serviceEvents(false);
  const info = POINTERS[ctx.mouse.cursor]!;
  grabPosition(ctx, info);
  copyBlock(ctx, false);
  if (!ctx.input.mouseInactive && ctx.shopSpriteSheet) {
    blitSprite2x2Clip(ctx.vga.screen, ctx.input.mouseX - info.x - info.fx, ctx.input.mouseY - info.y - info.fy, ctx.shopSpriteSheet, info.index);
  }
}

// port of JE_mouseStartFilter
export function mouseStartFilter(ctx: Ctx, filter: number): void {
  if (!ctx.mouse.hasMouse) return;
  const info = POINTERS[ctx.mouse.cursor]!;
  grabPosition(ctx, info);
  copyBlock(ctx, false);
  if (!ctx.input.mouseInactive && ctx.shopSpriteSheet) {
    blitSprite2x2FilterClip(ctx.vga.screen, ctx.input.mouseX - info.x - info.fx, ctx.input.mouseY - info.y - info.fy, ctx.shopSpriteSheet, info.index, filter);
  }
}

// port of JE_mouseReplace
export function mouseReplace(ctx: Ctx): void {
  if (ctx.mouse.hasMouse) copyBlock(ctx, true);
}
```

Run: `pnpm test` — Expected: all PASS (data tests run if `pnpm data` was done).
Run: `pnpm typecheck` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/assets.ts src/ctx.ts src/video/video.ts src/video/presenter.ts src/video/fade.ts src/video/mouse.ts src/platform/wait.ts test
git commit -m "feat: Ctx, asset loading, showVGA, waits, fades, presenter, mouse cursor

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 13: Screens (intro, title, stubs), game loop, browser boot

**Files:**
- Create: `src/screens/intro.ts`, `src/screens/title.ts`, `src/screens/stub.ts`, `src/game.ts`, `src/platform/dom-input.ts`, `src/boot-error.ts`
- Modify: `src/main.ts` (replace)
- Test: `test/screens/title.test.ts`, `test/platform/dom-input.test.ts`, `test/boot-error.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–12.
- Produces:
  - `intro.ts`: `introLogos(ctx): Promise<void>` (port of `intro_logos`).
  - `title.ts`: `titleScreen(ctx): Promise<boolean>` (port of `titleScreen`); `SA_DESTRUCT = 10`, `SA_ENGAGE = 11`.
  - `stub.ts`: `stubScreen(ctx, title: string, subtitle?: string): Promise<void>`; `quitScreen(ctx): Promise<void>`.
  - `game.ts`: `runGame(ctx): Promise<never>` (port of the `main()` loop from `opentyr.c`, intro included).
  - `dom-input.ts`: `attachDomInput(opts: { target: EventTarget; canvas: { getBoundingClientRect(): DOMRect }; input: Input; onToggleFullscreen: () => void }): () => void` (returns detach); `mapToScreen(clientX, clientY, rect): [number, number]`.
  - `boot-error.ts`: `formatBootError(err: unknown): string`.

- [ ] **Step 1: Port `intro_logos` — `src/screens/intro.ts`**

```ts
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { fadeBlack, fadePalette, fadeWhite } from '../video/fade';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';
import { waitDelayOrInput } from '../platform/wait';

// port of intro_logos (tyrian2.c)
export async function introLogos(ctx: Ctx): Promise<void> {
  const { palette, vga, assets } = ctx;
  ctx.state.moveTyrianLogoUp = true;

  clearSurface(vga.screen);
  await fadeWhite(ctx, 25);

  loadPic(assets.pics, palette, vga.screen, 10, false);
  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 25, 0, 255);
  ctx.delay.setDelay(200);
  await waitDelayOrInput(ctx);
  await fadeBlack(ctx, 10);

  loadPic(assets.pics, palette, vga.screen, 12, false);
  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 10, 0, 255);
  ctx.delay.setDelay(200);
  await waitDelayOrInput(ctx);
  await fadeBlack(ctx, 10);
}
```

Frame count check (matches the oracle): 25 + 1 + 25 + 10 + 1 + 10 + 10 = 82 frames (0–81).

- [ ] **Step 2: Stub screens — `src/screens/stub.ts`**

```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Placeholder screens for features arriving in later sub-projects (not a port).
import type { Ctx } from '../ctx';
import { waitInput, waitNoInput } from '../platform/wait';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHvShadow } from '../video/font';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';

export async function stubScreen(ctx: Ctx, title: string, subtitle = 'Not yet implemented'): Promise<void> {
  const { vga, palette, assets } = ctx;
  const tables = assets.shapes.tables;
  clearSurface(vga.screen);
  palette.colors.set(assets.palettes[0]!);
  drawFontHvShadow(vga.screen, tables, 160, 80, title, Font.Normal, Align.Centered, 15, -3, false, 2);
  drawFontHvShadow(vga.screen, tables, 160, 100, subtitle, Font.Small, Align.Centered, 15, 0, false, 1);
  drawFontHvShadow(vga.screen, tables, 160, 180, 'Press any key', Font.Small, Align.Centered, 15, -2, false, 1);
  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 10, 0, 255);
  await waitNoInput(ctx, true, true, false);
  await waitInput(ctx, true, true, false);
  await waitNoInput(ctx, true, true, false);
  await fadeBlack(ctx, 10);
}

export function quitScreen(ctx: Ctx): Promise<void> {
  return stubScreen(ctx, 'Thanks for playing!', 'Press any key to return to the title screen');
}
```

- [ ] **Step 3: Port `titleScreen` — `src/screens/title.ts`**

Open `reference/opentyrian2000/src/tyrian2.c` lines 3283–3610 alongside. Port verbatim with
these Foundation substitutions: `newGame()`, `JE_loadScreen()`, `JE_highScoreScreen()`,
`JE_helpSystem(1)`, `setupMenu()`, `newSuperArcadeGame(i)`, `newSuperTyrianGame()` and
`JE_whoa()` are not available yet — each becomes `await stubScreen(ctx, <label>)` followed by
`restart = true` (labels: the menu item text, or `assets.helpText.specialName[i]` for codes).
The idle → demo path and the Demo / Quit / Destruct exits stay exactly as in the C.

```ts
import { u16 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { loadCompShapes } from '../data/shapes';
import { S_CURSOR, S_SELECT, S_SPRING, SONG_TITLE, V_DANGER } from '../platform/audio';
import { SDL_BUTTON_LEFT, SDL_BUTTON_RIGHT } from '../platform/input';
import { Scancode } from '../platform/scancodes';
import { waitDelay } from '../platform/wait';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHv, drawFontHvShadow } from '../video/font';
import { textWidth } from '../video/fonthand';
import { MOUSE_POINTER_NORMAL, mouseReplace, mouseStartFilter } from '../video/mouse';
import { PLANET_SHAPES, blitSprite } from '../video/sprite';
import { copySurface } from '../video/surface';
import { showVGA } from '../video/video';
import { stubScreen } from './stub';

export const SA_DESTRUCT = 10;
export const SA_ENGAGE = 11;

const MENU_ITEM_NEW_GAME = 0, MENU_ITEM_LOAD_GAME = 1, MENU_ITEM_HIGH_SCORES = 2, MENU_ITEM_INSTRUCTIONS = 3,
  MENU_ITEM_SETUP = 4, MENU_ITEM_DEMO = 5, MENU_ITEM_QUIT = 6;

// port of titleScreen (tyrian2.c)
export async function titleScreen(ctx: Ctx): Promise<boolean> {
  const { input, palette, vga, assets, audio } = ctx;
  const tables = assets.shapes.tables;
  const menuText = assets.helpText.menuText;
  const specialName = assets.helpText.specialName;

  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(assets.archive, '1'); // mouse pointer sprites

  let restart = true;
  let selectedIndex = MENU_ITEM_NEW_GAME;
  const specialNameProgress = new Array<number>(SA_ENGAGE).fill(0);
  const xCenter = vga.screen.w / 2;
  const yMenuItems = 104;
  const hMenuItem = 13;
  const wMenuItem = new Array<number>(menuText.length).fill(0);

  for (;;) {
    if (restart) {
      audio.playSong(SONG_TITLE);
      loadPic(assets.pics, palette, vga.screen, 4, false);
      drawFontHvShadow(vga.screen, tables, 2, 192, ctx.state.versionString, Font.Small, Align.Left, 15, 0, false, 1);

      if (ctx.state.moveTyrianLogoUp) {
        copySurface(vga.screen2, vga.screen);
        blitSprite(vga.screen, 11, 62, tables[PLANET_SHAPES]!, 146); // tyrian logo
        blitSprite(vga.screen, 155, 41, tables[PLANET_SHAPES]!, 151); // 2000(tm)
        await fadePalette(ctx, palette.colors, 10, 0, 255 - 16);
        for (let yLogo = 60, y2K = 45; yLogo >= 4; yLogo -= 2, ++y2K) {
          ctx.delay.setDelay(2);
          copySurface(vga.screen, vga.screen2);
          blitSprite(vga.screen, 11, yLogo, tables[PLANET_SHAPES]!, 146);
          blitSprite(vga.screen, 155, y2K, tables[PLANET_SHAPES]!, 151);
          showVGA(ctx);
          await waitDelay(ctx);
        }
        ctx.state.moveTyrianLogoUp = false;
      } else {
        blitSprite(vga.screen, 11, 4, tables[PLANET_SHAPES]!, 146);
        blitSprite(vga.screen, 155, 73, tables[PLANET_SHAPES]!, 151);
        await fadePalette(ctx, palette.colors, 10, 0, 255 - 16);
      }

      for (let i = 0; i < menuText.length; ++i) {
        const text = menuText[i]!;
        wMenuItem[i] = textWidth(text, tables, Font.Normal);
        const x = xCenter - Math.trunc(wMenuItem[i]! / 2);
        const y = yMenuItems + hMenuItem * i;
        drawFontHv(vga.screen, tables, x - 1, y - 1, text, Font.Normal, Align.Left, 15, -10);
        drawFontHv(vga.screen, tables, x + 1, y + 1, text, Font.Normal, Align.Left, 15, -10);
        drawFontHv(vga.screen, tables, x + 1, y - 1, text, Font.Normal, Align.Left, 15, -10);
        drawFontHv(vga.screen, tables, x - 1, y + 1, text, Font.Normal, Align.Left, 15, -10);
        drawFontHv(vga.screen, tables, x, y, text, Font.Normal, Align.Left, 15, -3);
      }

      copySurface(vga.screen2, vga.screen);
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;
      await fadePalette(ctx, palette.colors, 20, 255 - 16 + 1, 255); // fade in menu items
      restart = false;
    }

    copySurface(vga.screen, vga.screen2);
    drawFontHv(vga.screen, tables, vga.screen.w / 2, yMenuItems + hMenuItem * selectedIndex, menuText[selectedIndex]!, Font.Normal, Align.Centered, 15, -1);

    input.serviceEvents(true);
    mouseStartFilter(ctx, 0xf0);
    showVGA(ctx);
    mouseReplace(ctx);

    const idleStartTick = ctx.clock.now();
    let mouseMoved = false;
    do {
      if (ctx.clock.now() - idleStartTick > 30000) { // play demo after idle for 30 seconds
        await fadeBlack(ctx, 15);
        ctx.state.playDemo = true;
        return true;
      }
      await ctx.clock.sleep(16);
      // C stores the old position in Uint16 and compares with the int: negative coordinates
      // always count as "moved". Keep that quirk.
      const oldMouseX = u16(input.mouseX);
      const oldMouseY = u16(input.mouseY);
      input.serviceEvents(false);
      mouseMoved = input.mouseX !== oldMouseX || input.mouseY !== oldMouseY;
    } while (!(input.newkey || input.newText || input.newmouse || mouseMoved));

    let action = false;
    let done = false;

    if (mouseMoved || input.newmouse) {
      for (let i = 0; i < menuText.length; ++i) {
        const xMenuItem = xCenter - Math.trunc(wMenuItem[i]! / 2);
        if (input.mouseX >= xMenuItem && input.mouseX < xMenuItem + wMenuItem[i]!) {
          const yMenuItem = yMenuItems + hMenuItem * i;
          if (input.mouseY >= yMenuItem && input.mouseY < yMenuItem + hMenuItem) {
            if (selectedIndex !== i) {
              audio.playSample(S_CURSOR);
              selectedIndex = i;
            }
            if (input.newmouse && input.lastmouseBut === SDL_BUTTON_LEFT &&
                input.lastmouseX >= xMenuItem && input.lastmouseX < xMenuItem + wMenuItem[i]! &&
                input.lastmouseY >= yMenuItem && input.lastmouseY < yMenuItem + hMenuItem) {
              action = true;
            }
            break;
          }
        }
      }
    }

    if (input.newmouse) {
      if (input.lastmouseBut === SDL_BUTTON_RIGHT) {
        audio.playSample(S_SPRING);
        done = true;
      }
    } else if (input.newkey) {
      switch (input.lastkeyScan) {
        case Scancode.Up:
          audio.playSample(S_CURSOR);
          selectedIndex = selectedIndex === 0 ? menuText.length - 1 : selectedIndex - 1;
          break;
        case Scancode.Down:
          audio.playSample(S_CURSOR);
          selectedIndex = selectedIndex === menuText.length - 1 ? 0 : selectedIndex + 1;
          break;
        case Scancode.Space:
        case Scancode.Return:
          action = true;
          break;
        case Scancode.Escape:
          audio.playSample(S_SPRING);
          done = true;
          break;
      }
    }

    if (input.newText) {
      for (const raw of input.lastText) {
        const c = raw.toUpperCase();
        for (let i = 0; i < SA_ENGAGE; i++) {
          const name = specialName[i]!;
          // C: progress >= COUNTOF(specialName[i]) - 1 (= 9) || c != specialName[i][progress]
          if (specialNameProgress[i]! >= 9 || c !== (name[specialNameProgress[i]!] ?? '\0')) {
            specialNameProgress[i] = 0;
            continue;
          }
          specialNameProgress[i]!++;
          if (specialNameProgress[i] === name.length) {
            if (i + 1 === SA_DESTRUCT) {
              await fadeBlack(ctx, 10);
              ctx.state.loadDestruct = true;
              return true;
            } else if (i + 1 === SA_ENGAGE) {
              audio.playSample(V_DANGER);
              await stubScreen(ctx, 'SuperTyrian'); // JE_whoa() + newSuperTyrianGame()
              restart = true;
            } else {
              await fadeBlack(ctx, 10);
              await stubScreen(ctx, assets.helpText.superShips[i + 1] ?? name); // newSuperArcadeGame(i)
              restart = true;
            }
          }
        }
      }
    }

    if (action) {
      audio.playSample(S_SELECT);
      switch (selectedIndex) {
        case MENU_ITEM_NEW_GAME:
        case MENU_ITEM_LOAD_GAME:
        case MENU_ITEM_HIGH_SCORES:
        case MENU_ITEM_INSTRUCTIONS:
        case MENU_ITEM_SETUP:
          await fadeBlack(ctx, 15);
          await stubScreen(ctx, menuText[selectedIndex]!);
          restart = true;
          break;
        case MENU_ITEM_DEMO:
          await fadeBlack(ctx, 15);
          ctx.state.playDemo = true;
          return true;
        case MENU_ITEM_QUIT:
          await fadeBlack(ctx, 15);
          return false;
      }
    }

    if (done) {
      await fadeBlack(ctx, 15);
      return false;
    }
  }
}
```

Note on `specialName[i][progress] == '\0'`: the C compares the *next* char with `'\0'` to
detect completion; `specialNameProgress[i] === name.length` is equivalent because names are
NUL-free strings shorter than 10.

- [ ] **Step 4: Game loop — `src/game.ts`**

```ts
import type { Ctx } from './ctx';
import { introLogos } from './screens/intro';
import { quitScreen, stubScreen } from './screens/stub';
import { titleScreen } from './screens/title';

// port of the main() loop (opentyr.c). JE_initPlayerData / JE_sortHighScores / JE_main
// arrive with later sub-projects; quitting returns to the title instead of exiting.
export async function runGame(ctx: Ctx): Promise<never> {
  await introLogos(ctx);
  for (;;) {
    ctx.state.playDemo = false;
    ctx.state.loadDestruct = false;
    if (!(await titleScreen(ctx))) {
      await quitScreen(ctx);
      continue;
    }
    if (ctx.state.loadDestruct) await stubScreen(ctx, 'Destruct');
    else if (ctx.state.playDemo) await stubScreen(ctx, 'Demo');
    else await stubScreen(ctx, 'Game');
  }
}
```

- [ ] **Step 5: DOM input adapter (tests first)**

`test/platform/dom-input.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { attachDomInput, mapToScreen } from '../../src/platform/dom-input';
import { Input } from '../../src/platform/input';

function keyEvent(type: string, init: { code: string; key?: string; repeat?: boolean; altKey?: boolean; ctrlKey?: boolean }) {
  const e = new Event(type, { cancelable: true }) as Event & typeof init;
  Object.assign(e, { key: init.key ?? '', repeat: false, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...init });
  return e;
}

function setup() {
  const target = new EventTarget();
  const input = new Input();
  const onToggleFullscreen = vi.fn();
  const rect = { left: 0, top: 0, width: 640, height: 400 } as DOMRect;
  attachDomInput({ target, canvas: { getBoundingClientRect: () => rect }, input, onToggleFullscreen });
  return { target, input, onToggleFullscreen };
}

describe('dom-input', () => {
  it('maps window points to 320x200 like mapWindowPointToScreen', () => {
    const rect = { left: 10, top: 0, width: 640, height: 400 } as DOMRect;
    expect(mapToScreen(10, 0, rect)).toEqual([0, 0]);
    expect(mapToScreen(649, 399, rect)).toEqual([319, 199]);
    expect(mapToScreen(-100, 0, rect)[0]).toBeLessThan(0);
  });
  it('prevents browser defaults for game keys and queues keydown + text', () => {
    const { target, input } = setup();
    const e = keyEvent('keydown', { code: 'Space', key: ' ' });
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    input.serviceEvents(false);
    expect(input.lastkeyScan).toBe(44);
  });
  it('delivers auto-repeat keydowns (SDL2 does too)', () => {
    const { target, input } = setup();
    target.dispatchEvent(keyEvent('keydown', { code: 'ArrowDown' }));
    target.dispatchEvent(keyEvent('keydown', { code: 'ArrowDown', repeat: true }));
    input.serviceEvents(true);
    expect(input.newkey).toBe(true);
    input.serviceEvents(true);
    expect(input.newkey).toBe(true);
  });
  it('Alt+Enter and F11 toggle fullscreen and are not delivered', () => {
    const { target, input, onToggleFullscreen } = setup();
    target.dispatchEvent(keyEvent('keydown', { code: 'Enter', altKey: true }));
    target.dispatchEvent(keyEvent('keydown', { code: 'F11' }));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(2);
    input.serviceEvents(false);
    expect(input.newkey).toBe(false);
  });
  it('releases held keys on blur', () => {
    const { target, input } = setup();
    target.dispatchEvent(keyEvent('keydown', { code: 'ArrowRight' }));
    input.serviceEvents(false);
    target.dispatchEvent(new Event('blur'));
    input.serviceEvents(false);
    expect([input.keydown, input.keysactive[79]]).toEqual([false, 0]);
  });
  it('prevents the context menu', () => {
    const { target } = setup();
    const e = new Event('contextmenu', { cancelable: true });
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
```

`src/platform/dom-input.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
// Browser replacement for SDL's event source: DOM events → Input queue.
import { KMOD_LALT, KMOD_LCTRL, KMOD_LSHIFT, scancodeFromCode } from './scancodes';
import type { Input } from './input';

/** Same rounding as mapWindowPointToScreen (video.c), with the canvas rect as the output rect. */
export function mapToScreen(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): [number, number] {
  const x = Math.trunc(((2 * (clientX - rect.left) + 1) * 320) / (2 * rect.width));
  const y = Math.trunc(((2 * (clientY - rect.top) + 1) * 200) / (2 * rect.height));
  return [x, y];
}

const DOM_TO_SDL_BUTTON: Record<number, number> = { 0: 1, 1: 2, 2: 3 };

export function attachDomInput(opts: {
  target: EventTarget;
  canvas: { getBoundingClientRect(): DOMRect };
  input: Input;
  onToggleFullscreen: () => void;
}): () => void {
  const { target, canvas, input } = opts;
  const listeners: [string, EventListener][] = [];
  const on = <E extends Event>(type: string, fn: (e: E) => void) => {
    const l = fn as unknown as EventListener;
    target.addEventListener(type, l);
    listeners.push([type, l]);
  };

  on<KeyboardEvent>('keydown', (e) => {
    if ((e.altKey && e.code === 'Enter') || e.code === 'F11') {
      e.preventDefault();
      opts.onToggleFullscreen();
      return;
    }
    const sc = scancodeFromCode(e.code);
    if (sc === undefined) return;
    if (!e.metaKey) e.preventDefault();
    const mod = (e.shiftKey ? KMOD_LSHIFT : 0) | (e.ctrlKey ? KMOD_LCTRL : 0) | (e.altKey ? KMOD_LALT : 0);
    input.push({ type: 'keydown', scancode: sc, mod });
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) input.push({ type: 'text', text: e.key });
  });
  on<KeyboardEvent>('keyup', (e) => {
    const sc = scancodeFromCode(e.code);
    if (sc === undefined) return;
    input.push({ type: 'keyup', scancode: sc });
  });
  on<MouseEvent>('mousemove', (e) => {
    const [x, y] = mapToScreen(e.clientX, e.clientY, canvas.getBoundingClientRect());
    input.push({ type: 'mousemove', x, y, moved: e.movementX !== 0 || e.movementY !== 0 });
  });
  on<MouseEvent>('mousedown', (e) => {
    const button = DOM_TO_SDL_BUTTON[e.button];
    if (button === undefined) return;
    const [x, y] = mapToScreen(e.clientX, e.clientY, canvas.getBoundingClientRect());
    input.push({ type: 'mousedown', button, x, y });
  });
  on<MouseEvent>('mouseup', (e) => {
    const button = DOM_TO_SDL_BUTTON[e.button];
    if (button === undefined) return;
    const [x, y] = mapToScreen(e.clientX, e.clientY, canvas.getBoundingClientRect());
    input.push({ type: 'mouseup', button, x, y });
  });
  on('contextmenu', (e) => e.preventDefault());
  on('blur', () => input.releaseAll());

  return () => {
    for (const [type, l] of listeners) target.removeEventListener(type, l);
  };
}
```

- [ ] **Step 6: Boot error + `main.ts`**

`test/boot-error.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatBootError } from '../src/boot-error';

describe('formatBootError', () => {
  it('explains missing data', () => {
    expect(formatBootError(new Error('could not download game data from data/tyrian2000.t2kpak (HTTP 404)')))
      .toMatch(/pnpm data/);
  });
  it('explains a corrupt pack', () => {
    expect(formatBootError(new Error('not a Tyrian data pack (bad magic)'))).toMatch(/pnpm data/);
  });
  it('falls back to the message', () => {
    expect(formatBootError('boom')).toContain('boom');
  });
});
```

`src/boot-error.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
export function formatBootError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/game data|data pack|missing data file/.test(msg)) {
    return `Could not load the Tyrian 2000 game data.\n${msg}\n\nDevelopers: run "pnpm data ~/Downloads/tyrian2000.zip" and reload.`;
  }
  return `Something went wrong:\n${msg}`;
}
```

`src/main.ts` (replace):
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { loadAssets } from './assets';
import { formatBootError } from './boot-error';
import { createCtx } from './ctx';
import { DATA_URL, fetchArchive } from './data/archive';
import { runGame } from './game';
import { BrowserClock } from './platform/clock';
import { attachDomInput } from './platform/dom-input';
import { CanvasPresenter } from './video/presenter';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

function waitForStartGesture(): Promise<void> {
  overlay.textContent = 'OpenTyrian2000\n\nClick or press any key to start';
  return new Promise((resolve) => {
    const go = (e: Event) => {
      e.preventDefault();
      window.removeEventListener('keydown', go);
      window.removeEventListener('pointerdown', go);
      resolve();
    };
    window.addEventListener('keydown', go);
    window.addEventListener('pointerdown', go);
  });
}

async function boot(): Promise<void> {
  overlay.textContent = 'Loading game data…';
  const archive = await fetchArchive(DATA_URL, (loaded, total) => {
    overlay.textContent = total ? `Loading game data… ${Math.round((loaded / total) * 100)}%` : 'Loading game data…';
  });
  const assets = loadAssets(archive);
  await waitForStartGesture();
  overlay.hidden = true;
  canvas.focus();
  const ctx = createCtx({ assets, clock: new BrowserClock(), presenter: new CanvasPresenter(canvas) });
  attachDomInput({
    target: window,
    canvas,
    input: ctx.input,
    onToggleFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    },
  });
  await runGame(ctx);
}

boot().catch((err: unknown) => {
  console.error(err);
  overlay.hidden = false;
  overlay.textContent = formatBootError(err);
});
```

- [ ] **Step 7: Title smoke test (data required)**

`test/screens/title.test.ts`:
```ts
import { expect, it } from 'vitest';
import { titleScreen } from '../../src/screens/title';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('titleScreen', () => {
  it('Escape quits after the menu appears', async () => {
    const ctx = testCtx()!;
    let frames = 0;
    ctx.frameSink = () => {
      frames++;
      // Frame 31 is the idle menu (10 logo-fade + 20 menu-fade + 1). A key pressed during a
      // fade would be consumed by the fade's event servicing, exactly like the C.
      if (frames === 31) ctx.input.push({ type: 'keydown', scancode: 41, mod: 0 });
    };
    expect(await titleScreen(ctx)).toBe(false);
    expect(frames).toBe(10 + 20 + 1 + 15); // logo fade + menu fade + idle frame + fade_black(15)
  });
  it('idling 30 s requests the demo', async () => {
    const ctx = testCtx()!;
    expect(await titleScreen(ctx)).toBe(true);
    expect(ctx.state.playDemo).toBe(true);
  });
});
```

Run: `pnpm test` — Expected: PASS. Run: `pnpm typecheck` — Expected: no errors.

- [ ] **Step 8: Manual check**

Run: `pnpm dev`, open the printed URL in Chromium. Expected: "Click or press any key to
start" → white fade → XSIV logo → Eclipse logo → title with logo sliding up → menu fades in;
arrows move the highlight; Enter on "Load Game" shows the stub and returns; mouse hover
highlights items and shows the pointer; Esc → "Thanks for playing!" → back to title.

- [ ] **Step 9: Commit**

```bash
git add src test
git commit -m "feat: intro logos, title screen, stub screens, browser boot and DOM input

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 14: Golden frame tests against the oracle

**Files:**
- Create: `test/golden/harness.ts`, `test/golden/compare.ts`, `test/golden/boot.test.ts`, `test/golden/menu-nav.test.ts`

**Interfaces:**
- Consumes: `SCENARIOS`/`Scenario` (Task 4), `readFramesFile`/`ORACLE_DIR`/`Frame` (Task 4), `writeIndexedPng` (Task 4), `testArchive` (Task 3), `loadAssets`, `createCtx`, `VirtualClock`, `NullPresenter`, `runGame` (Tasks 11–13).
- Produces: `runScenario(scenario: Scenario): Promise<Frame[]>`; `compareFrames(name: string, expected: Frame[], actual: Frame[]): string | null` (null = identical; otherwise a human-readable first difference; writes PNGs to `test-output/golden/<name>/`).

Harness semantics mirror the oracle patch: frames are captured inside `showVGA`; key presses
for frame *f* are queued (keydown + keyup, mod 0) right after frame *f* is captured; after
`maxFrames` frames the harness throws `StopScenario` to end the run.

- [ ] **Step 1: Harness + compare**

`test/golden/harness.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { loadAssets } from '../../src/assets';
import { createCtx } from '../../src/ctx';
import { runGame } from '../../src/game';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import type { Scenario } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import type { Frame } from '../helpers/frames';

class StopScenario extends Error {}

export async function runScenario(scenario: Scenario): Promise<Frame[]> {
  const ctx = createCtx({
    assets: loadAssets(testArchive!), clock: new VirtualClock(), presenter: new NullPresenter(),
    versionString: 'oracle', seed: 1,
  });
  const frames: Frame[] = [];
  ctx.frameSink = (screen, palette) => {
    const index = frames.length;
    frames.push({ index, palette: palette.slice(), pixels: screen.pixels.slice() });
    for (const k of scenario.keys) {
      if (k.frame === index) {
        ctx.input.push({ type: 'keydown', scancode: k.scancode, mod: 0 });
        ctx.input.push({ type: 'keyup', scancode: k.scancode });
      }
    }
    if (frames.length >= scenario.maxFrames) throw new StopScenario();
  };
  try {
    await runGame(ctx);
  } catch (e) {
    if (!(e instanceof StopScenario)) throw e;
  }
  return frames;
}
```

`test/golden/compare.ts`:
```ts
// SPDX-License-Identifier: GPL-2.0-or-later
import { fileURLToPath } from 'node:url';
import type { Frame } from '../helpers/frames';
import { writeIndexedPng } from '../helpers/png';

const OUT = fileURLToPath(new URL('../../test-output/golden', import.meta.url));

export function compareFrames(name: string, expected: Frame[], actual: Frame[]): string | null {
  const n = Math.min(expected.length, actual.length);
  for (let f = 0; f < n; f++) {
    const e = expected[f]!, a = actual[f]!;
    let problem: string | null = null;
    for (let i = 0; i < 768 && !problem; i++) {
      if (e.palette[i] !== a.palette[i]) {
        problem = `frame ${f}: palette entry ${Math.floor(i / 3)} channel ${'rgb'[i % 3]} expected ${e.palette[i]} got ${a.palette[i]}`;
      }
    }
    for (let i = 0; i < 64000 && !problem; i++) {
      if (e.pixels[i] !== a.pixels[i]) {
        problem = `frame ${f}: pixel (${i % 320},${Math.floor(i / 320)}) expected ${e.pixels[i]} got ${a.pixels[i]}`;
      }
    }
    if (problem) {
      writeIndexedPng(`${OUT}/${name}/frame${f}-expected.png`, e);
      writeIndexedPng(`${OUT}/${name}/frame${f}-actual.png`, a);
      return `${problem} (PNGs in test-output/golden/${name}/)`;
    }
  }
  if (expected.length !== actual.length) return `frame count: expected ${expected.length} got ${actual.length}`;
  return null;
}
```

- [ ] **Step 2: Golden tests**

`test/golden/boot.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { SCENARIOS } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR, readFramesFile } from '../helpers/frames';
import { compareFrames } from './compare';
import { runScenario } from './harness';

const expected = readFramesFile(resolve(ORACLE_DIR, 'boot.frames'));
const d = testArchive && expected ? describe : describe.skip;

d('golden: boot (intro logos → title → idle menu)', () => {
  it('matches the C original frame-for-frame', async () => {
    const actual = await runScenario(SCENARIOS.boot);
    expect(compareFrames('boot', expected!, actual)).toBeNull();
  });
});
```

`test/golden/menu-nav.test.ts`: identical with `'menu-nav'` /
`SCENARIOS['menu-nav']` / `'menu-nav.frames'` and the title
`'golden: main menu navigation (Down×3, Up)'`.

- [ ] **Step 3: Run and fix until identical**

Run: `pnpm oracle` (if not done) then `pnpm test test/golden`.
Expected: PASS for both. If a frame differs, open the expected/actual PNGs, find the C
function responsible for that frame (frame map in Task 4), diff its port against the C,
and fix the port (never the test or the oracle). Typical suspects: fade step math,
`blitSprite` row handling, `drawFontHv` glyph advance, menu text positions, frame count of
a fade (one `showVGA` per step).

- [ ] **Step 4: Commit**

```bash
git add test/golden
git commit -m "test: golden frame comparison against the C oracle

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

### Task 15: Build verification and docs

**Files:**
- Modify: `README.md` (add "Status" + "Architecture" sections)

- [ ] **Step 1: Full verification**

Run, in order, and confirm each:
```bash
pnpm typecheck     # no errors
pnpm test          # all pass; golden tests ran (not skipped) — check the summary
pnpm build         # dist/ written
ls dist/data/tyrian2000.t2kpak   # data copied from public/
pnpm preview       # open the URL: same behaviour as the Task 13 manual check
```

- [ ] **Step 2: README additions**

Append to `README.md`:
```markdown
## Status

Sub-project 1 (Foundation) — intro, title screen and main menu, pixel-identical to the
C original (verified by golden frame tests). Menu items other than navigation show
placeholder screens. Audio, gameplay and the rest arrive in later sub-projects; see
`docs/superpowers/specs/`.

## Architecture (short)

- `src/core` – C integer semantics, binary reader, Mersenne Twister.
- `src/data` – loaders for the original data files.
- `src/video` – 8-bit surfaces, blitters, fonts, palette fades, canvas presenter.
- `src/platform` – clock, delays, input, audio interface.
- `src/screens` – ported game screens. Blocking C loops are `async` functions.
- `tools/oracle` – builds the original C with a frame-dump patch; golden tests compare.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README status and architecture

Claude-Session: https://claude.ai/code/session_01JXJ4hjEXrGM5Vja2B6e4Wz"
```

---

## Notes for later sub-projects (do not implement now)

- `JE_loadConfiguration` consumes `mt_rand()` (default high-score names) when no config
  exists — Sub-project 4 must port that *before* demo playback, or RNG streams diverge
  from the oracle.
- The oracle runs with an empty `HOME`, so config is always defaults; keep it that way
  for golden tests.
