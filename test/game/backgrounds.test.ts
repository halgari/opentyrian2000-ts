// SPDX-License-Identifier: GPL-2.0-or-later
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkSmoothies, drawBackground1, drawBackground2, drawBackground2Blend, drawBackground3, filterScreen,
  updateAndDrawStarfield,
} from '../../src/game/backgrounds';
import { createGameWorld, MAP1_COLS, MAP2_COLS, MAP3_COLS } from '../../src/game/world';
import { createSurface } from '../../src/video/surface';
import { runDemoScenario } from '../golden/demo-harness';
import { ORACLE_DIR, readFramesFile } from '../helpers/frames';
import { readStates } from '../helpers/state-trace';
import { testArchive } from '../helpers/data';
import type { Ctx } from '../../src/ctx';

/** A ctx-shaped object around a synthetic world and a 320x200 surface (no game data needed). */
function synth(): Ctx {
  const game = createGameWorld();
  const vga = { screen: createSurface(), gameScreen: createSurface(), cur: null as unknown };
  vga.cur = vga.gameScreen;
  return { game, vga } as unknown as Ctx;
}

// megaData1 tile slot x is at shapes[x * 672]; megaData2/3 at shapes[x * 676 + 4]
function setTile1(ctx: Ctx, slot: number, value: number): void {
  ctx.game.map.megaData1.shapes.fill(value, slot * 672, slot * 672 + 672);
}

describe('map memory model (pointer arithmetic, survey 5.3)', () => {
  it('level start pointers are row*cols - 1 (C: &mainmap[row][0] - 1)', () => {
    // 292 rows * 14 - 1; the blit then starts at mapYPos + mapXbpPos - 12 and walks +14 per tile row
    expect(292 * MAP1_COLS - 1).toBe(4087);
    expect(592 * MAP2_COLS - 1).toBe(8287);
    expect(592 * MAP3_COLS - 1).toBe(8879);
  });

  it('mapXbpPos at its minimum/maximum spills into the neighbouring row slots', () => {
    const ctx = synth();
    const b = ctx.game.backgrounds;
    const mm = ctx.game.map.megaData1.mainmap;
    // mark each slot with the slot-index it would read, via distinct tile ids: slot n holds tile id (n % 72)
    // (tile 5 solid 0x55, others 0)
    setTile1(ctx, 5, 0x55);
    mm.fill(-1);
    // one row start at mapYPos = 20*14-1 = 279, i=-1 => map = 279 + bp - 12 for the first row
    b.mapYPos = 20 * MAP1_COLS - 1;
    // bp = 1 (min of 1 - 0): first tile slot = 268; put a tile there
    b.mapXbpPos = 1;
    mm[268] = 5;
    b.backPos = 0; b.mapXPos = 0;
    drawBackground1(ctx, ctx.vga.gameScreen);
    // i = -1 row: y = -28 (+backPos 0): tile 0 of row -1 is off-screen above; the pixels of tile row 0 start at
    // screen y 0 (the last 28 lines of row i=-1 land at -28..-1, i.e. none visible). Row i=0 uses slot 268+14.
    mm.fill(-1);
    mm[268 + 14] = 5; // i=0, tile 0
    drawBackground1(ctx, ctx.vga.gameScreen);
    expect(ctx.vga.gameScreen.pixels[0]).toBe(0x55);
    expect(ctx.vga.gameScreen.pixels[23]).toBe(0x55);
    expect(ctx.vga.gameScreen.pixels[24]).toBe(0);
    // bp = 1 - 3 = -2 (mapXOfs/24 maximum 3): tile 0 is slot 279-2-12+14 = 279
    b.mapXbpPos = -2;
    mm.fill(-1);
    mm[279 - 2 - 12 + 14 + 11] = 5; // i=0, tile 11 => spills into the next map row's first slots when bp > 1
    drawBackground1(ctx, ctx.vga.gameScreen);
    expect(ctx.vga.gameScreen.pixels[11 * 24]).toBe(0x55);
  });

  it('a row read that crosses the row end reads the next row (flat), not wrapping', () => {
    const ctx = synth();
    const b = ctx.game.backgrounds;
    setTile1(ctx, 7, 0x77);
    b.mapYPos = 30 * MAP1_COLS - 1;
    b.mapXbpPos = 1;
    // i=0: map = 419 + 1 - 12 + 14 = 422 = row 30 col 2 ; tile 12-... tile index 11 -> slot 433 = row 30 col 13
    // use bp such that tile 11 reads slot (row 31, col 0) = 434 : bp = 2
    b.mapXbpPos = 2;
    ctx.game.map.megaData1.mainmap[434] = 7;
    drawBackground1(ctx, ctx.vga.gameScreen);
    expect(ctx.vga.gameScreen.pixels[11 * 24]).toBe(0x77);
  });

  it('reads outside the layer array as NULL tiles (not modelled)', () => {
    const ctx = synth();
    ctx.game.backgrounds.mapYPos = 300 * MAP1_COLS - 1;
    ctx.game.backgrounds.mapXbpPos = 0;
    expect(() => drawBackground1(ctx, ctx.vga.gameScreen)).not.toThrow();
    expect(ctx.vga.gameScreen.pixels.every((v) => v === 0)).toBe(true);
  });

  it('BKwrap: the level.ts wrap compares slot indexes (mapYPos <= BKwrap -> BKwrapTo)', () => {
    const g = createGameWorld();
    g.map.BKwrap1 = g.map.BKwrap1to = MAP1_COLS; // &mainmap[1][0]
    g.backgrounds.mapYPos = MAP1_COLS - 1; // &mainmap[1][0] - 1: one slot before => wraps
    if (g.backgrounds.mapYPos <= g.map.BKwrap1) g.backgrounds.mapYPos = g.map.BKwrap1to;
    expect(g.backgrounds.mapYPos).toBe(14);
  });
});

describe('layers 2 and 3', () => {
  it('layer 3 advances backPos3 before drawing and steps the pointer by its 15-wide rows', () => {
    const ctx = synth();
    const b = ctx.game.backgrounds;
    b.mapY3Pos = 100 * MAP3_COLS - 1;
    b.mapX3bpPos = 1;
    b.backMove3 = 30; b.backPos3 = 0; b.mapY3 = 100;
    drawBackground3(ctx, ctx.vga.gameScreen);
    expect(b.backPos3).toBe(2);
    expect(b.mapY3).toBe(99);
    expect(b.mapY3Pos).toBe(100 * MAP3_COLS - 1 - MAP3_COLS);
  });

  it('layer 2 steps map2YDelay and the 14-wide pointer; draws only when background2', () => {
    const ctx = synth();
    const b = ctx.game.backgrounds;
    b.mapY2Pos = 100 * MAP2_COLS - 1; b.mapX2bpPos = 1;
    b.map2YDelay = 1; b.map2YDelayMax = 1; b.backMove2 = 1; b.backPos2 = 27; b.mapY2 = 100;
    drawBackground2(ctx, ctx.vga.gameScreen); // background2 false: no blit (would be fine anyway), still scrolls
    expect(b.backPos2).toBe(0);
    expect(b.mapY2).toBe(99);
    expect(b.mapY2Pos).toBe(100 * MAP2_COLS - 1 - MAP2_COLS);
  });

  it('blend: (data & 0xf0) | ((dst&15 + data&15) / 2) for non-zero data', () => {
    const ctx = synth();
    const b = ctx.game.backgrounds;
    ctx.game.map.megaData2.shapes.fill(0x3a, 3 * 676 + 4, 3 * 676 + 4 + 672);
    b.mapY2Pos = 100 * MAP2_COLS - 1; b.mapX2bpPos = 1;
    b.map2YDelay = 2; b.map2YDelayMax = 2;
    ctx.game.map.megaData2.mainmap[100 * MAP2_COLS - 1 + 1 - 12 + 14] = 3;
    ctx.vga.gameScreen.pixels[0] = 0x04;
    drawBackground2Blend(ctx, ctx.vga.gameScreen);
    expect(ctx.vga.gameScreen.pixels[0]).toBe(0x30 | ((4 + 10) >> 1));
  });
});

describe('starfield, filter, smoothies', () => {
  it('moves by (speed+moveSpeed)*pitch and draws a 5 pixel cross only for bright stars', () => {
    const ctx = synth();
    const s = ctx.game.backgrounds.starfieldStars;
    s.position.fill(0xffff); // far below 177*320 after... 65535 is not < 56640: hidden
    s.position[0] = 100 * 320 + 50 - 3 * 320; s.speed[0] = 2; s.color[0] = 0x9a; // -> row 100 after +(2+1)*320
    s.position[1] = 10 * 320 + 60 - 3 * 320; s.speed[1] = 2; s.color[1] = 0x92; // dim: single pixel
    const surf = ctx.vga.gameScreen;
    updateAndDrawStarfield(ctx, surf, 1);
    const at = 100 * 320 + 50;
    expect(surf.pixels[at]).toBe(0x9a);
    for (const o of [1, -1, 320, -320]) expect(surf.pixels[at + o]).toBe(0x96);
    const at1 = 10 * 320 + 60;
    expect(surf.pixels[at1]).toBe(0x92);
    expect(surf.pixels[at1 + 1]).toBe(0);
  });

  it('does not overwrite non-zero pixels and wraps the JE_word position', () => {
    const ctx = synth();
    const s = ctx.game.backgrounds.starfieldStars;
    s.position.fill(0xffff);
    s.position[5] = 65000; s.speed[5] = 2; s.color[5] = 0x9f; // 65000 + 960 wraps to 424
    const surf = ctx.vga.gameScreen;
    surf.pixels[424] = 0x11;
    updateAndDrawStarfield(ctx, surf, 1);
    expect(s.position[5]).toBe((65000 + 960) & 0xffff);
    expect(surf.pixels[424]).toBe(0x11);
    expect(surf.pixels[425]).toBe(0x9b);
  });

  it('filterScreen: hue replace and intensity add, fade state machine', () => {
    const ctx = synth();
    const c = ctx.game.config;
    const px = ctx.vga.gameScreen.pixels;
    c.filtrationAvail = true; c.explosionTransparent = true;
    px[24] = 0x37; px[24 + 263] = 0x3c; px[23] = 0x37;
    filterScreen(ctx, 8, 3);
    expect(px[24]).toBe(0x8a);
    expect(px[24 + 263]).toBe(0x8f); // 0xc + 3 = 15 -> 0x0f
    expect(px[23]).toBe(0x37); // outside the 264x184 window
    px[24] = 0x8e;
    filterScreen(ctx, -99, 20); // 0xe + 20 >= 0x1f -> 0
    expect(px[24]).toBe(0x80);
    c.filterFade = true; c.levelBrightness = 14; c.levelBrightnessChg = 1; c.filterFadeStart = false;
    c.levelFilterNew = 5;
    filterScreen(ctx, -99, -99);
    expect(c.levelBrightness).toBe(15);
    expect(c.levelBrightnessChg).toBe(-1);
    expect(c.levelFilter).toBe(5);
    expect(c.filterFadeStart).toBe(false);
  });

  it('checkSmoothies follows processorType', () => {
    const ctx = synth();
    const c = ctx.game.config;
    c.processorType = 3; c.smoothies[0] = true;
    checkSmoothies(ctx);
    expect(ctx.game.backgrounds.anySmoothies).toBe(true);
    c.smoothies[0] = false; c.smoothies[3] = true; c.processorType = 1;
    checkSmoothies(ctx);
    expect(ctx.game.backgrounds.anySmoothies).toBe(false);
    c.processorType = 2;
    checkSmoothies(ctx);
    expect(ctx.game.backgrounds.anySmoothies).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Pixels vs the C original. demo-1, first level loop frame (213).
//
// Frame 213 also holds things other tasks draw. Compared region: the play window (x 24..287, y 0..183) minus
//  - the ship (task 11): oracle p0x/p0y from the state record, rect screen x [p0x-40, p0x-7) (the play window starts at screen x 24, ship centre at p0x-24),
//    y [p0y-17, p0y+22) (sprite 24x28 plus engine flame; measured from the diff bounding box 63..92 x 143..181);
//  - the top message bar (task 8, drawLevelTopBars / level name text): x 88..191, y 8..23.
// Nothing else is drawn on this frame (enemyOnScreen = 0, no shots, no explosions in the oracle state).
// ---------------------------------------------------------------------------------------------
const raw = readFramesFile(resolve(ORACLE_DIR, 'demo-1.raw.frames'));
const dp = testArchive && raw ? describe : describe.skip;

dp('background layer 1 pixels vs oracle (demo-1 frame 213)', () => {
  it('matches the oracle play window outside the ship rectangle', async () => {
    const oracle = raw!.find((f) => f.index === 213)!;
    const { ctx } = await runDemoScenario('demo-1', 214);
    const ours = ctx.vga.screen.pixels;
    const st = readStates(resolve(ORACLE_DIR, 'demo-1.state'))![213]!;
    const p0x = st.p0x, p0y = st.p0y;
    let bad = 0, first = '';
    for (let y = 0; y < 184; y++) {
      for (let x = 24; x < 288; x++) {
        if (x >= p0x - 40 && x < p0x - 7 && y >= p0y - 17 && y < p0y + 22) continue; // ship (screen x = p0x - 24)
        if (x >= 88 && x < 192 && y >= 8 && y < 24) continue; // top message bar
        if (ours[y * 320 + x] !== oracle.pixels[y * 320 + x]) { bad++; if (!first) first = `${x},${y}`; }
      }
    }
    expect(bad, `first mismatch at ${first}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Starfield vs the C original. demo-4 is the demo whose stars are not hidden by ground (survey 4.1).
// The stars are advanced directly here (the full-demo goldens cover the live event-driven path): the oracle frame f shows the init positions advanced by (f - 213) updates with
// move_speed 1 (frame 213 shows them unmoved: the event that turns the starfield on runs inside that frame).
// Compared by hue (0x9_): the level-start brightness fade (filterScreen) rewrites the low nibble.
// Window columns 0..263 of the oracle frame correspond to game_screen columns 24..287 (survey 4.1).
// ---------------------------------------------------------------------------------------------
const raw4 = readFramesFile(resolve(ORACLE_DIR, 'demo-4.raw.frames'));
const d4 = testArchive && raw4 ? describe : describe.skip;

d4('starfield pixels vs oracle (demo-4)', () => {
  it.each([214, 216, 224])('frame %i: star hue pixels identical (cross pixels included)', async (frame) => {
    const o = raw4!.find((f) => f.index === frame);
    expect(o, 'raw fixture lacks this frame: pnpm oracle:run demo-4 --raw 213-240 --fixture').toBeDefined();
    if (!o) return;
    const { ctx } = await runDemoScenario('demo-4', 214); // stops after the first loop frame; stars still at init positions
    const surf = createSurface();
    for (let k = 0; k < frame - 213; k++) { surf.pixels.fill(0); updateAndDrawStarfield(ctx, surf, 1); }
    const st = readStates(resolve(ORACLE_DIR, 'demo-4.state'))![frame]!;
    const p0x = st.p0x, p0y = st.p0y;
    let stars = 0, bad = 0;
    for (let y = 0; y < 184; y++) {
      for (let x = 0; x < 264; x++) {
        const sx = x + 24; // oracle screen column
        if (sx >= 88 && sx < 192 && y >= 8 && y < 24) continue; // top message bar (task 8)
        if (sx >= p0x - 44 && sx < p0x + 12 && y >= p0y - 17 && y < p0y + 24) continue; // ship (task 11), screen x = p0x - 24
        const a = (surf.pixels[y * 320 + x + 24]! & 0xf0) === 0x90;
        const b = (o.pixels[y * 320 + x]! & 0xf0) === 0x90;
        if (a) stars++;
        if (a !== b) bad++;
      }
    }
    expect(stars, `frame ${frame} stars`).toBeGreaterThan(200);
    expect(bad, `frame ${frame} bad`).toBe(0);
  });
});
