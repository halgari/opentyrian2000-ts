import { describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/ctx';
import { createGameWorld } from '../../src/game/world';
import { helpBox } from '../../src/screens/help-box';
import { barDrawShadow, displayText, outCharGlow, outTextGlow, textState, updateWarning } from '../../src/video/glow-text';
import { PART_SHADE } from '../../src/video/fonthand';
import { emptySpriteTable, TINY_FONT, type SpriteTable } from '../../src/video/sprite';
import { createSurface } from '../../src/video/surface';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

// --- synthetic-surface pixel tests (no game data) ---------------------------------------------

/** Tiny font whose glyphs 'A'..'F' (ids 0..5) are 3x1 rows of 5. */
function synthTables(): SpriteTable[] {
  const t = emptySpriteTable();
  t.count = 6;
  for (let i = 0; i < 6; i++) t.sprites[i] = { width: 3, height: 1, size: 3, data: Uint8Array.of(5, 5, 5) };
  const tables: SpriteTable[] = Array.from({ length: 8 }, () => emptySpriteTable());
  tables[TINY_FONT] = t;
  return tables;
}
const synthCtx = (): Ctx => ({ assets: { shapes: { tables: synthTables() } }, game: createGameWorld() }) as unknown as Ctx;

describe('helpBox (helptext.c:128)', () => {
  const GLYPH = 0x50 | (5 + 3); // colour 5, brightness 3

  it('wraps at word boundaries like the C and resets colour/shade type', () => {
    const ctx = synthCtx();
    const ts = textState(ctx);
    ts.helpBoxColor = 5;
    ts.helpBoxBrightness = 3;
    ts.helpBoxShadeType = PART_SHADE;
    const s = createSurface();
    s.pixels.fill(0xff);
    helpBox(ctx, s, 10, 20, 'AB CD EF', 5); // hand trace: "AB CD" / "EF"
    const at = (x: number, y: number): number => s.pixels[y * 320 + x]!;
    // line 1 at y=20: A@10, B@14, space, C@24, D@28
    expect([at(10, 20), at(14, 20), at(24, 20), at(28, 20)]).toEqual([GLYPH, GLYPH, GLYPH, GLYPH]);
    // line 2 at y=27 (verticalHeight 7): E@10, F@14
    expect([at(10, 27), at(14, 27)]).toEqual([GLYPH, GLYPH]);
    // EF is not on line 1 (the word after the wrap), nothing drawn past D
    expect(at(32, 20)).toBe(0xff);
    // PART_SHADE shadow: black at +1,+1
    expect(at(11 + 0, 21)).toBe(0);
    expect(ts.helpBoxColor).toBe(12);
    expect(ts.helpBoxShadeType).toBe(1);
    expect(ts.helpBoxBrightness).toBe(3); // brightness is not reset
  });

  it('a message shorter than the box width is drawn on one line', () => {
    const ctx = synthCtx();
    const ts = textState(ctx);
    ts.helpBoxColor = 5; ts.helpBoxBrightness = 3; ts.helpBoxShadeType = PART_SHADE;
    const s = createSurface();
    s.pixels.fill(0xff);
    helpBox(ctx, s, 0, 0, 'AB CD', 44);
    expect(s.pixels[0]).toBe(GLYPH);
    expect(s.pixels[14]).toBe(GLYPH); // C
    expect(s.pixels[7 * 320]).toBe(0xff); // no second line
  });

  it('empty message draws nothing and keeps state', () => {
    const ctx = synthCtx();
    const ts = textState(ctx);
    ts.helpBoxColor = 5;
    helpBox(ctx, createSurface(), 0, 0, '', 10);
    expect(ts.helpBoxColor).toBe(5);
  });
});

describe('barDrawShadow (nortvars.c:63)', () => {
  it('full segments: body col+12, top col+13, corner col+15, bottom col+11, 2px gap, shadow darkened', () => {
    const s = createSurface();
    s.pixels.fill(0x2b);
    barDrawShadow(s, 10, 10, 1, 16, 2, 3, 13); // xsize 2, ysize 12; segments at x=10 and x=14
    const at = (x: number, y: number): number => s.pixels[y * 320 + x]!;
    expect(at(10, 10)).toBe(31);
    expect(at(11, 10)).toBe(29);
    expect(at(12, 10)).toBe(29);
    expect(at(11, 15)).toBe(28);
    expect(at(11, 22)).toBe(27);
    expect(at(10, 22)).toBe(27);
    expect(at(14, 10)).toBe(31);
    expect(at(15, 15)).toBe(28);
    expect(at(13, 15)).toBe(0x25); // gap between segments: inside segment 1's shadow (x 12..14)
  });
  it('shadow is the barShade of the box offset by (2,2)', () => {
    const s = createSurface();
    s.pixels.fill(0x2b);
    barDrawShadow(s, 10, 10, 1, 16, 1, 3, 13);
    expect(s.pixels[23 * 320 + 13]).toBe(0x25); // (13,23): below the bar, inside the shadow
    expect(s.pixels[23 * 320 + 9]).toBe(0x2b);
  });
  it('partial segment uses col + (12/res)*amt', () => {
    const s = createSurface();
    barDrawShadow(s, 0, 0, 4, 16, 6, 3, 3); // one full segment (amt/res = 1), remainder 2 -> col + 3*2
    expect(s.pixels[1 * 320 + 1]).toBe(28);
    expect(s.pixels[1 * 320 + 4]).toBe(16 + 6); // second segment starts at x = 0 + 2 + 2
    expect(s.pixels[1 * 320 + 7]).toBe(0);
  });
  it('amt 0 draws nothing', () => {
    const s = createSurface();
    barDrawShadow(s, 5, 5, 1, 16, 0, 3, 13);
    expect(s.pixels.every((v) => v === 0)).toBe(true);
  });
});

// --- timing / frame counts (need the game data for the real font tables) -----------------------

describeData('glow text timing (VirtualClock)', () => {
  const count = (ctx: Ctx): { frames: number } => {
    const r = { frames: 0 };
    ctx.frameSink = () => { r.frames++; };
    return r;
  };

  it('outCharGlow with frameCountMax 0 shows one frame immediately', async () => {
    const ctx = testCtx()!;
    const r = count(ctx);
    ctx.game.config.frameCountMax = 0;
    await outCharGlow(ctx, 10, 55, 'HELLO');
    expect(r.frames).toBe(1);
    expect(ctx.clock.now()).toBe(0);
  });

  it('outCharGlow runs strlen+28 frames, each paced by frameCountMax (4 delay units = 57 ms -> four 16 ms sleeps)', async () => {
    const ctx = testCtx()!;
    const r = count(ctx);
    ctx.game.config.frameCountMax = 4;
    await outCharGlow(ctx, 10, 55, 'HELLO');
    expect(r.frames).toBe(5 + 28);
    expect(ctx.clock.now()).toBe((5 + 28) * 64);
  });

  it('outCharGlow: an empty string draws nothing, a key press cuts the animation short but finishes the pass', async () => {
    const ctx = testCtx()!;
    const r = count(ctx);
    ctx.game.config.frameCountMax = 4;
    await outCharGlow(ctx, 10, 55, '');
    expect(r.frames).toBe(0);
    ctx.input.push({ type: 'keydown', scancode: 4, mod: 0 });
    await outCharGlow(ctx, 10, 55, 'HELLO');
    expect(ctx.game.config.frameCountMax).toBe(0);
    expect(r.frames).toBe(33); // frames still run (delay 0), only the pacing is gone
    // frame 1 was already paced at 4 units (64 ms); the other 32 get delay 0 but the C still does one SDL_Delay(16)
    expect(ctx.clock.now()).toBe(64 + 32 * 16);
  });

  it('outTextGlow: 12 rising + 7 falling frames at speed, 1 frame when frameCountMax is 0; resets textGlowBrightness', async () => {
    const ctx = testCtx()!;
    const r = count(ctx);
    ctx.game.config.frameCountMax = 4;
    textState(ctx).textGlowBrightness = 3;
    await outTextGlow(ctx, ctx.vga.screen, 20, 20, 'Hi');
    expect(r.frames).toBe(12 + 10); // z = 12..3 on the way down
    expect(textState(ctx).textGlowBrightness).toBe(6);
    r.frames = 0;
    ctx.game.config.frameCountMax = 0;
    await outTextGlow(ctx, ctx.vga.screen, 20, 20, 'Hi');
    expect(r.frames).toBe(1);
  });

  it('outTextGlow: pressing a key during the rising half stops the pacing and shortens the falling half', async () => {
    const ctx = testCtx()!;
    const r = count(ctx);
    ctx.game.config.frameCountMax = 4;
    ctx.input.push({ type: 'keydown', scancode: 4, mod: 0 });
    await outTextGlow(ctx, ctx.vga.screen, 20, 20, 'Hi');
    expect(ctx.game.config.frameCountMax).toBe(0);
    expect(r.frames).toBe(12 + 1); // the rising loop was entered with frameCountMax > 0; the falling loop starts at 6
  });

  it('updateWarning cycles the bars and plays the warning sound every 15 calls', () => {
    const ctx = testCtx()!;
    const v = ctx.game.varz;
    v.warningCol = 14 * 16 + 4;
    v.warningColChange = 1;
    v.warningSoundDelay = 0;
    const played: number[] = [];
    ctx.audio.playSample = (n: number) => { played.push(n); };
    updateWarning(ctx, ctx.vga.screen);
    expect(v.warningCol).toBe(14 * 16 + 5);
    expect(ctx.vga.screen.pixels[0]).toBe(14 * 16 + 5);
    expect(ctx.vga.screen.pixels[199 * 320 + 319]).toBe(14 * 16 + 5);
    expect(ctx.vga.screen.pixels[6 * 320]).toBe(0);
    expect(v.warningSoundDelay).toBe(14);
    expect(played).toEqual([17]);
    updateWarning(ctx, ctx.vga.screen); // setDelay2(6) has not elapsed
    expect(v.warningCol).toBe(14 * 16 + 5);
    ctx.clock.sleep(100);
    v.warningCol = 14 * 16 + 11;
    updateWarning(ctx, ctx.vga.screen);
    expect(v.warningColChange).toBe(-1);
  });

  it('displayText shows each line, the "press a key" line, then waits for a key and clears levelWarningDisplay', async () => {
    const ctx = testCtx()!;
    const r = count(ctx);
    const ts = textState(ctx);
    ts.levelWarningLines = 2;
    ts.levelWarningText[0] = 'First line';
    ts.levelWarningText[1] = 'Second line';
    ts.levelWarningDisplay = true;
    ctx.game.config.frameCountMax = 0;
    ctx.input.push({ type: 'keydown', scancode: 4, mod: 0 });
    await displayText(ctx);
    expect(ts.levelWarningDisplay).toBe(false);
    expect(ctx.game.scratch.temp).toBe(0);
    expect(ctx.game.scratch.tempW).toBe(184);
    expect(r.frames).toBeGreaterThanOrEqual(3);
  });
});
