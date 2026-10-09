// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHOPC_SCENARIOS, SHOP_FRAME0 } from '../../tools/oracle/scenarios-shopc';
import { loadMap } from '../../src/game/level';
import { decryptSaveTemp, serializeCfg, serializeSav } from '../../src/game/save';
import { scancodeName } from '../../src/platform/scancode-names';
import type { ShopState } from '../../src/screens/shop';
import { testCtx } from '../helpers/ctx';
import { ORACLE_DIR } from '../helpers/frames';
import { frameCrc, readHashes } from '../helpers/hash-frames';
import { Stop, injectOracleInput } from '../helpers/inject';
import { newGameWorld } from '../helpers/shop';
import { readStates2 } from '../helpers/state-trace';

// loadMap calls itemScreen(ctx); the mock hands it a ShopState the test can read (the C's static curMenu)
const captured = vi.hoisted(() => ({ state: null as ShopState | null }));
vi.mock('../../src/screens/shop', async (orig) => {
  const m = await orig<typeof import('../../src/screens/shop')>();
  return { ...m, itemScreen: (ctx: Parameters<typeof m.itemScreen>[0]) => m.itemScreen(ctx, (captured.state = new m.ShopState())) };
});

// The first shop of a new game driven through Shop C: options (volume keys and sliders, joystick screen, key capture / swap /
// reserved keys / reset, mouse config, F1 help) and the save/load screens (typed names, overwrite, Alt+S / Alt+L, load).
// TS frame i is oracle frame 220 + i; every presented frame must hash like the C's, STATE2 must agree, and the saved files
// (tyrian.sav bytes, tyrian.cfg, the opentyrian.cfg key names) must equal the C's.
for (const name of Object.keys(SHOPC_SCENARIOS)) {
  const sc = SHOPC_SCENARIOS[name]!;
  const hashes = readHashes(resolve(ORACLE_DIR, `${name}.hash`));
  const states = readStates2(resolve(ORACLE_DIR, `${name}.state2`));
  const d = testCtx() && hashes && states ? describe : describe.skip;

  d(`golden: shop C, ${name}`, () => {
    it('matches the C hash and STATE2 on every frame, and the saved files byte for byte', async () => {
      const ctx = newGameWorld();
      const g = ctx.game;
      g.items.initialEpisodeNum = 1; // menus.c:416, set by the episode select that precedes the shop
      const last = sc.maxFrames - SHOP_FRAME0;
      const mismatches: string[] = [];
      let lastShop: ShopState | null = null;
      const crcs = injectOracleInput(ctx, sc, SHOP_FRAME0, frameCrc, (i) => {
        const shop = captured.state;
        if (!shop) return;
        const o = states![SHOP_FRAME0 + i]!;
        const p0 = g.players[0];
        const ts: Record<string, number> = {
          cash: p0.cash >>> 0, mainLevel: g.config.mainLevel, saveLevel: g.config.saveLevel, gameLoaded: g.varz.gameLoaded ? 1 : 0,
          curMenu: shop.curMenu, scratchTemp: g.scratch.temp, scratchTemp2: g.scratch.temp2, scratchTemp3: g.scratch.temp3,
          scratchTempW: g.scratch.tempW,
        };
        // the C's curMenu is a static that keeps its old value until the prologue of the next visit assigns FULL_GAME, after the
        // first presented frame; a new ShopState starts at FULL_GAME, so that one frame is not comparable
        if (shop !== lastShop) { lastShop = shop; if (i > 0) delete ts.curMenu; }
        const exp = o as unknown as Record<string, number>;
        for (const [k, v] of Object.entries(ts)) if (exp[k] !== v && mismatches.length < 20) mismatches.push(`frame ${SHOP_FRAME0 + i} ${k}: ts ${v} oracle ${exp[k]}`);
        if (i === last - 1) throw new Stop();
      });
      await expect(loadMap(ctx)).rejects.toBeInstanceOf(Stop);
      expect(mismatches).toEqual([]);
      expect(crcs).toHaveLength(last);
      const bad: number[] = [];
      for (let i = 0; i < crcs.length; i++) if (crcs[i]!.toString(16) !== hashes![SHOP_FRAME0 + i]!.toString(16)) bad.push(SHOP_FRAME0 + i);
      expect(bad.slice(0, 10)).toEqual([]);

      // saved files
      const dir = resolve(ORACLE_DIR, `${name}.save`);
      if (existsSync(resolve(dir, 'tyrian.sav'))) {
        const cSav = new Uint8Array(readFileSync(resolve(dir, 'tyrian.sav')));
        const tsSav = serializeSav(g.config);
        const diffs: string[] = [];
        // compare decrypted (an early difference smears over everything after it in the encrypted image)
        const plain = (b: Uint8Array): Uint8Array => { const x = b.slice(0, 2502); decryptSaveTemp(x); return x; };
        const tp = plain(tsSav), cp = plain(cSav);
        for (let i = 0; i < 2498 && diffs.length < 20; i++) if (tp[i] !== cp[i]) diffs.push(`record ${Math.floor(i / 109)} +${i % 109} (byte ${i}): ts ${tp[i]} c ${cp[i]}`);
        if (tsSav.length !== cSav.length) diffs.push(`length ts ${tsSav.length} c ${cSav.length}`);
        expect(diffs).toEqual([]);
        expect(Buffer.from(serializeCfg(g.config)).equals(Buffer.from(new Uint8Array(readFileSync(resolve(dir, 'tyrian.cfg')))))).toBe(true);
      }
      if (existsSync(resolve(dir, 'opentyrian.cfg'))) {
        const text = readFileSync(resolve(dir, 'opentyrian.cfg'), 'utf8');
        const names = ['up', 'down', 'left', 'right', 'fire', 'change fire', 'left sidekick', 'right sidekick'];
        names.forEach((k, i) => {
          const m = new RegExp(`^\\s*item '${k}' '(.*)'$`, 'm').exec(text);
          expect(m?.[1], k).toBe(scancodeName(g.config.keySettings[i]!));
        });
      }
    });
  });
}
