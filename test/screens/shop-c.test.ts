// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { SC, Timeline } from '../../tools/oracle/scenarios-shopc';
import type { Ctx } from '../../src/ctx';
import { saveName } from '../../src/game/save';
import { STORAGE_KEYS } from '../../src/platform/storage';
import { defaultKeySettings, defaultMouseSettings } from '../../src/game/world';
import { decryptSaveTemp } from '../../src/game/save';
import { scancodeName } from '../../src/platform/scancode-names';
import { itemScreen } from '../../src/screens/shop';
import { loadCube } from '../../src/screens/shop-cubes';
import { MENU_DATA_CUBES, MENU_DATA_CUBE_SUB, MENU_FULL_GAME, MENU_KEYBOARD_CONFIG, MENU_LOAD_SAVE, MENU_OPTIONS, ShopState } from '../../src/screens/shop-draw';
import { describeData } from '../helpers/data';
import { Stop, injectOracleInput } from '../helpers/inject';
import { newGameWorld } from '../helpers/shop';

const D = SC.Down, U = SC.Up, R = SC.Return;

/** The cubes ]? gives the first shop: four of them. */
function withCubes(ctx: Ctx): void {
  ctx.game.config.cubeMax = 4;
  ctx.game.config.cubeList.set([1, 2, 3, 5]);
}

/** Runs the shop on a new game while `build` scripts input (frame 1 on); stops after the script plus a few frames. */
async function run(build: (t: Timeline, ctx: Ctx) => void, setup: (ctx: Ctx) => void = withCubes): Promise<{ ctx: Ctx; shop: ShopState; frames: number }> {
  const ctx = newGameWorld();
  ctx.game.items.initialEpisodeNum = 1;
  setup?.(ctx);
  const t = new Timeline(1);
  build(t, ctx);
  const last = t.f + 10;
  let frames = 0;
  injectOracleInput(ctx, { keys: t.keys, text: t.text, mouse: t.mouse }, 0, () => 0, (i) => { frames = i + 1; if (i === last) throw new Stop(); });
  const shop = new ShopState();
  await expect(itemScreen(ctx, shop)).rejects.toBeInstanceOf(Stop);
  return { ctx, shop, frames };
}

describe('scancodeName (SDL_GetScancodeName)', () => {
  it('names the keys a browser can produce', () => {
    expect(scancodeName(82)).toBe('Up');
    expect(scancodeName(44)).toBe('Space');
    expect(scancodeName(40)).toBe('Return');
    expect(scancodeName(224)).toBe('Left Ctrl');
    expect(scancodeName(226)).toBe('Left Alt');
    expect(scancodeName(4)).toBe('A');
    expect(scancodeName(39)).toBe('0');
    expect(scancodeName(58)).toBe('F1');
    expect(scancodeName(98)).toBe('Keypad 0');
    expect(scancodeName(88)).toBe('Keypad Enter');
    expect(scancodeName(83)).toBe('Numlock');
    expect(scancodeName(999)).toBe('');
  });
});

describeData('shop C: options', () => {
  it('Left / Right change the volume rows by 12 and clamp (JE_changeVolume), mouse sliders set it from the x position', async () => {
    const { ctx } = await run((t, c) => {
      c.game.config.tyrMusicVolume = 250;
      c.game.config.fxVolume = 6;
      t.tap(D, D, D, R, D, D, SC.Right, SC.Right);   // music: 250 + 12 clamps to 255
      t.tap(D, SC.Left, SC.Left);                    // fx: 6 - 12 clamps to 0
    });
    expect(ctx.game.config.tyrMusicVolume).toBe(255);
    expect(ctx.game.config.fxVolume).toBe(0);

    const m = await run((t) => { t.tap(D, D, D, R).click(225 - 4 + 4 * 5 + 1, 76); }); // music bar, five steps in
    expect(m.ctx.game.config.tyrMusicVolume).toBe(60);
    expect(m.shop.curSel[MENU_OPTIONS]).toBe(4);
    const f = await run((t) => { t.tap(D, D, D, R).click(225 + 4 * 30, 90); });         // effects bar, far right: clamps
    expect(f.ctx.game.config.fxVolume).toBe(255);
    expect(f.shop.curSel[MENU_OPTIONS]).toBe(5);
  });

  it('key config: capture, swap with the slot that had the key, reserved keys (Esc, F11, P) are not assigned, reset to defaults', async () => {
    const { ctx, shop } = await run((t) => {
      t.tap(D, D, D, R, D, D, D, D, D, R);           // options -> keyboard (row 7)
      t.tap(R).wait(6).tap(SC.W);                    // Up := W
      t.tap(D, R).wait(6).tap(SC.Left);              // Down := Left, Left := Down (swap)
      t.tap(D, R).wait(6).tap(SC.Escape);            // Esc: reserved
      t.tap(R).wait(6).tap(SC.F11);                  // F11: reserved
      t.tap(R).wait(6).tap(SC.P);                    // P: reserved
    });
    const k = ctx.game.config.keySettings;
    expect(Array.from(k)).toEqual([SC.W, SC.Left, SC.Down, 79, 44, 40, 224, 226]);
    expect(shop.curMenu).toBe(MENU_KEYBOARD_CONFIG);

    const r = await run((t) => {
      t.tap(D, D, D, R, D, D, D, D, D, R);
      t.tap(R).wait(6).tap(SC.W);
      t.tap(D, D, D, D, D, D, D, D, R);              // row 10: reset to defaults
    });
    expect(Array.from(r.ctx.game.config.keySettings)).toEqual(Array.from(defaultKeySettings));
    // capturing an existing key moves the old one into the slot being changed even for a reserved key
    const e = await run((t) => {
      t.tap(D, D, D, R, D, D, D, D, D, R);
      t.tap(R).wait(6).tap(SC.Escape);               // nobody uses Esc: nothing changes
    });
    expect(Array.from(e.ctx.game.config.keySettings)).toEqual(Array.from(defaultKeySettings));
  });

  it('mouse config cycles 1..5 and resets; the joystick screen only offers Done', async () => {
    const { ctx, shop } = await run((t) => {
      t.tap(D, D, D, R, D, D, D, D, D, D, R);        // options -> mouse (row 8)
      t.tap(R, R, D, R);                             // left 1 -> 3; right 4 -> 5
      t.tap(D, R, R, R, R, R);                       // middle 5 -> 1 -> ... five presses wrap to 5
    });
    expect(Array.from(ctx.game.config.mouseSettings)).toEqual([3, 5, 5]);
    expect(shop.curMenu).toBe(14);
    const r = await run((t) => { t.tap(D, D, D, R, D, D, D, D, D, D, R, R, D, D, D, R); });
    expect(Array.from(r.ctx.game.config.mouseSettings)).toEqual(Array.from(defaultMouseSettings));
    const j = await run((t) => { t.tap(D, D, D, R, D, D, D, D, R, R, R, U, R); }); // joystick: Enter ignored on rows, Up wraps to Done
    expect(j.shop.curMenu).toBe(MENU_OPTIONS);
    expect(j.shop.menuChoices[12]).toBe(17);
  });
});

describeData('shop C: save, load, quick save', () => {
  it('a typed name (upper-cased, backspace, unknown glyphs dropped) is saved to a slot and the stored file decrypts', async () => {
    const { ctx, shop } = await run((t) => {
      t.tap(D, D, D, R, D, R, D, R);                 // options -> save -> slot 2
      t.type('abc 1');
      t.tap(SC.Backspace);
      t.type('Z&');                                  // '&' has no font glyph: ignored
      t.tap(R).wait(6).tap(R);                       // save request: yes
    });
    const f = ctx.game.config.saveFiles[1]!;
    expect(saveName(f)).toBe('ABC Z         '.slice(0, 14)); // the name keeps its trailing spaces (14 chars)
    expect(f.level).toBe(ctx.game.config.saveLevel);
    expect(f.score).toBe(10000);
    expect(shop.curMenu).toBe(MENU_LOAD_SAVE);
    // the stored file is the exact C image and decrypts with a good checksum
    const sav = new Uint8Array(Buffer.from(ctx.storage.get(STORAGE_KEYS.sav)!, 'base64'));
    expect(sav.length).toBe(4722);
    const tmp = sav.slice(0, 2502);
    expect(decryptSaveTemp(tmp)).toEqual([]);
  });

  it('Esc and "No" do not save; the name entry cancels with Esc', async () => {
    const { ctx } = await run((t) => {
      t.tap(D, D, D, R, D, R, D, R);
      t.type('x').tap(SC.Escape).wait(8);            // cancel name entry
      t.tap(R).wait(4).type('y').tap(R).wait(6).tap(SC.Left, R); // request: toggle to No
    });
    expect(ctx.game.config.saveFiles[1]!.level).toBe(0);
    expect(saveName(ctx.game.config.saveFiles[1]!)).toBe(' '.repeat(14)); // an empty slot's name is 14 blanks
  });

  it('Alt+S opens the save screen and Esc returns to the menu it came from; Alt+L loads', async () => {
    const a = await run((t) => {
      t.tap(D, D, D, R);                             // options
      t.chord(SC.LAlt, SC.S, 8).wait(10);
    });
    expect(a.shop.curMenu).toBe(MENU_LOAD_SAVE);
    expect(a.shop.quikSave).toBe(true);
    expect(a.shop.oldMenu).toBe(MENU_OPTIONS);
    expect(a.ctx.game.varz.performSave).toBe(true);
    const b = await run((t) => {
      t.chord(SC.LAlt, SC.S, 8).wait(10);
      t.tap(SC.Escape).wait(6);
    });
    expect(b.shop.curMenu).toBe(MENU_FULL_GAME);
    const c = await run((t) => { t.chord(SC.LAlt, SC.L, 8).wait(10); });
    expect(c.ctx.game.varz.performSave).toBe(false);
    // loading an empty slot does nothing
    const e = await run((t) => { t.chord(SC.LAlt, SC.L, 8).wait(10); t.tap(R).wait(6); });
    expect(e.ctx.game.varz.gameLoaded).toBe(false);
  });

  it('Load of a saved slot ends the shop with gameLoaded and the slot restored', async () => {
    const ctx = newGameWorld();
    ctx.game.items.initialEpisodeNum = 1;
    const { saveGame } = await import('../../src/game/save');
    ctx.game.config.saveLevel = 7;
    saveGame(ctx, 2, 'SAVED');
    ctx.game.players[0].cash = 5;
    ctx.game.config.mainLevel = 1;
    const t = new Timeline(1);
    t.tap(D, D, D, R, R, D, R);                      // options -> load -> slot 2
    injectOracleInput(ctx, { keys: t.keys, text: t.text, mouse: t.mouse }, 0, () => 0, (i) => { if (i > 3000) throw new Stop(); });
    await itemScreen(ctx);
    expect(ctx.game.varz.gameLoaded).toBe(true);
    expect(ctx.game.config.mainLevel).toBe(7);
    expect(ctx.game.players[0].cash).toBe(10000);
  });
});

describeData('shop C: data cubes', () => {
  it('load_cube word-wraps the cube text into 36-char / 150px lines (paragraph breaks, 4-line gaps)', () => {
    const ctx = newGameWorld();
    for (const i of [1, 2, 3, 5, 23]) {
      const c = loadCube(ctx, i);
      expect(c.lastLine).toBeGreaterThan(0);
      expect(c.title.length).toBeLessThanOrEqual(80);
      expect(c.header.length).toBeLessThanOrEqual(12);
      for (const line of c.text) expect(line.length).toBeLessThanOrEqual(36);
      expect(c.text[c.lastLine - 1]).not.toBe('');
      expect(c.text.slice(c.lastLine).every((l) => l === '')).toBe(true);
    }
    const c1 = loadCube(ctx, 1);
    expect(c1.faceSprite).toBeGreaterThanOrEqual(-1);
    // the first word of a paragraph line is preceded by the space the C always prepends
    expect(c1.text[0]!.startsWith(' ')).toBe(true);
  });

  it('the reader scrolls with PageDown / Down, stops at the end, Home returns to the top, Esc leaves; the list keeps the cursor', async () => {
    const a = await run((t) => {
      t.tap(R);                                      // list
      t.tap(D, R).wait(10);                          // cube 2
      t.hold(SC.PageDown, 40);
    });
    expect(a.shop.curMenu).toBe(MENU_DATA_CUBE_SUB);
    expect(a.shop.yLoc).toBeGreaterThan(0);
    expect(a.shop.currentCube).toBe(1);
    const b = await run((t) => {
      t.tap(R, R).wait(10).hold(SC.PageDown, 40).tap(SC.Home).wait(4);
    });
    expect(b.shop.yLoc).toBe(0);
    const c = await run((t) => { t.tap(R, R).wait(10).tap(SC.End).wait(10); });
    const last = c.shop.cubes[0]!.lastLine;
    expect(c.shop.yLoc).toBe(Math.max(0, (last - 9) * 12));
    const d = await run((t) => { t.tap(R, R).wait(10).tap(SC.Escape).wait(6); });
    expect(d.shop.curMenu).toBe(MENU_DATA_CUBES);
    expect(d.shop.curSel[MENU_DATA_CUBES]).toBe(2);
    const e = await run((t) => { t.tap(U, R).wait(6); }); // Up wraps to "Exit to Game Menu", Return leaves
    expect(e.shop.curMenu).toBe(MENU_FULL_GAME);
  });

  it('F1 opens the help system and returns to the shop with the picture and palette reloaded', async () => {
    const a = await run((t) => { t.tap(SC.F1).wait(40).tap(SC.Escape).wait(80); });
    expect(a.shop.backFromHelp).toBe(false);          // consumed by the fade back in
    expect(a.shop.curMenu).toBe(MENU_FULL_GAME);
  });
});
