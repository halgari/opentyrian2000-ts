import { describe, expect, it } from 'vitest';
import {
  dBar3, drawArmor, drawOptions, drawPortConfigButtons, drawShield, drawTextWindow, gammaCorrect, wipeShieldArmorBars,
} from '../../src/game/hud';
import { loadNextDemo } from '../../src/game/demo';
import { blitSprite, OPTION_SHAPES } from '../../src/video/sprite';
import { createSurface } from '../../src/video/surface';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

const rowColor = (s: ReturnType<typeof createSurface>, x: number, y: number): number => s.pixels[y * s.pitch + x]!;

describe('dBar3', () => {
  it('draws 2-row segments upward from y, colour steps as the zWait counter of the C dictates', () => {
    const s = createSurface();
    // col starts at 146; zWait 2 -> 1 -> 0, so segments z=0..2 use 146, the colour steps after z=2 (147 for z=3,4),
    // then after z=4 (148 for z=5). Segment z covers rows y-2z-1 .. y-2z.
    dBar3(s, 270, 194, 5, 144);
    for (const y of [194, 193, 192, 191, 190, 189]) expect(rowColor(s, 270, y)).toBe(146);
    for (const y of [188, 187, 186, 185]) expect(rowColor(s, 270, y)).toBe(147);
    for (const y of [184, 183]) expect(rowColor(s, 270, y)).toBe(148);
    expect(rowColor(s, 270, 182)).toBe(0);
    expect(rowColor(s, 278, 194)).toBe(146); // 9 px wide: x .. x+8
    expect(rowColor(s, 279, 194)).toBe(0);
  });

  it('num 0 draws a single segment', () => {
    const s = createSurface();
    dBar3(s, 307, 194, 0, 224);
    expect(rowColor(s, 307, 194)).toBe(226);
    expect(rowColor(s, 307, 193)).toBe(226);
    expect(rowColor(s, 307, 192)).toBe(0);
  });
});

describe('gammaCorrect', () => {
  it('is the identity at gamma 0, scales with roundf (half away from zero) and clamps at 255', () => {
    const id = Uint8Array.of(0, 1, 3, 200, 255);
    gammaCorrect(id, 0);
    expect(Array.from(id)).toEqual([0, 1, 3, 200, 255]);
    const half = Uint8Array.of(1, 3, 100, 200); // r = 1.5
    gammaCorrect(half, 5);
    expect(Array.from(half)).toEqual([2, 5, 150, 255]); // 1.5 -> 2, 4.5 -> 5
  });
});

describeData('HUD drawing', () => {
  it('drawTextWindow sets textErase, restores the message area only when it was set, and draws text', () => {
    const ctx = testCtx()!;
    const seg = ctx.vga.screen;
    expect(ctx.game.varz.textErase).toBe(0);
    drawTextWindow(ctx, 'Good luck...');
    expect(ctx.game.varz.textErase).toBe(100);
    let lit = 0;
    for (let y = 190; y < 198; y++) for (let x = 20; x < 100; x++) if (seg.pixels[y * 320 + x]) lit++;
    expect(lit).toBeGreaterThan(20);
    // second call: the area is first repainted with OPTION_SHAPES 36, then the new text drawn
    const expected = createSurface();
    blitSprite(expected, 16, 189, ctx.assets.shapes.tables[OPTION_SHAPES]!, 36);
    drawTextWindow(ctx, '');
    for (let x = 16; x < 40; x++) expect(seg.pixels[189 * 320 + x]).toBe(expected.pixels[189 * 320 + x]);
  });

  it('drawPortConfigButtons lights button 18 on the active side', () => {
    const ctx = testCtx()!;
    const opt = ctx.assets.shapes.tables[OPTION_SHAPES]!;
    const exp1 = createSurface(), exp2 = createSurface();
    blitSprite(exp1, 285, 44, opt, 18); blitSprite(exp1, 302, 44, opt, 19);
    blitSprite(exp2, 285, 44, opt, 19); blitSprite(exp2, 302, 44, opt, 18);
    ctx.game.players[0].weaponMode = 1;
    drawPortConfigButtons(ctx);
    expect(ctx.vga.screen.pixels).toEqual(exp1.pixels);
    ctx.game.players[0].weaponMode = 2;
    drawPortConfigButtons(ctx);
    expect(ctx.vga.screen.pixels).toEqual(exp2.pixels);
  });

  it('drawShield / drawArmor / wipeShieldArmorBars use the C geometry', () => {
    const ctx = testCtx()!;
    const s = ctx.vga.screen;
    const p = ctx.game.players[0];
    p.shield = 3; p.shieldMax = 6; p.armor = 40;
    drawShield(ctx, s);
    expect(rowColor(s, 270, 194)).toBe(146); // dBar3 col 144 + 2
    expect(rowColor(s, 270, 193 - 6 * 2)).toBe(68); // max-shield marker at y = 193 - shield_max*2, colour 68
    drawArmor(ctx, s);
    expect(p.armor).toBe(28); // clamped
    expect(rowColor(s, 307, 194)).toBe(226);
    wipeShieldArmorBars(ctx);
    // wipes (270,137)-(278, 194 - shield*2) and (307,137)-(315, 194 - armor*2)
    expect(rowColor(s, 270, 137)).toBe(0);
    expect(rowColor(s, 270, 188)).toBe(0);
    expect(rowColor(s, 307, 137)).toBe(0);
    expect(rowColor(s, 307, 138)).toBe(0);
    expect(rowColor(s, 270, 189)).toBe(146); // below the wiped range (194 - 6 = 188) the bar stays
  });

  it('drawOptions initialises both sidekick records from the option table', () => {
    const ctx = testCtx()!;
    loadNextDemo(ctx); // demo.1: sidekicks 21 and 20
    drawOptions(ctx);
    const p = ctx.game.players[0];
    for (let i = 0; i < 2; i++) {
      const o = ctx.game.items.options[p.items.sidekick[i]!]!;
      const sk = p.sidekick[i]!;
      expect(sk.ammo).toBe(o.ammo);
      expect(sk.ammoMax).toBe(o.ammo);
      expect(sk.ammoRefillTicks).toBe((105 - o.ammo) * 4);
      expect(sk.style).toBe(o.tr);
      expect(sk.animationEnabled).toBe(o.option === 1);
      expect(sk.chargeTicks).toBe(20);
    }
    expect(p.items.sidekick).toEqual([21, 20]);
  });
});
