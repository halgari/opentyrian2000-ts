import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/ctx';
import { PCX_PAL } from '../../src/data/pcxmast';
import { loadPic } from '../../src/data/pic';
import { loadPCX } from '../../src/data/pcx';
import { NullAudio } from '../../src/platform/audio';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { runEpisodeScript } from '../../src/game/script';
import { saveName } from '../../src/game/save';
import { totalScore } from '../../src/game/economy';
import { DIFFICULTY_HARD, DIFFICULTY_NORMAL } from '../../src/game/world';
import { createSurface } from '../../src/video/surface';
import { testCtx } from '../helpers/ctx';
import { describeData } from '../helpers/data';
import { useScript } from '../helpers/script';

// The shop is exercised separately (test/golden/script.test.ts uses the real stub); here its effects are scripted.
const shop = vi.hoisted(() => ({ impl: (_ctx: unknown): void => {}, calls: 0 }));
// the real JE_nextEpisode is covered by test/golden/episode-end.test.ts; here it only marks that the command reached it
vi.mock('../../src/screens/episode-end', () => ({ nextEpisode: async (): Promise<void> => { throw new Error('JE_nextEpisode'); } }));

vi.mock('../../src/screens/shop', () => ({
  itemScreen: async (ctx: unknown): Promise<void> => { shop.calls++; shop.impl(ctx); },
}));

function makeCtx(lines: string[]): Ctx {
  const ctx = testCtx()!;
  loadConfigurationDefaults(ctx);
  initPlayerData(ctx);
  initEpisode(ctx, 1);
  useScript(ctx, lines);
  ctx.game.config.mainLevel = 1;
  ctx.game.config.initialDifficulty = DIFFICULTY_NORMAL;
  return ctx;
}
const run = (ctx: Ctx) => runEpisodeScript(ctx, new Uint8Array(256));
const L = (next: string, name: string, song: string, file: string, tail = ''): string => `]L[ 9999 ${next} ${name.padEnd(9)}${song} ${file}${tail}`;
const LEVEL = L('004', 'TYRIAN', '18', '09');

beforeEach(() => { shop.calls = 0; shop.impl = () => {}; });

describeData('episode script parser: control flow', () => {
  it('skips to the mainLevel-th `*` line, ignores non-command lines, and stops at ]L', async () => {
    const ctx = makeCtx(['*1', L('001', 'ONE', '01', '01'), '*2', 'plain text', ']Z unknown command', L('005', 'TWO', '02', '02'), '*3', L('009', 'THREE', '03', '03')]);
    ctx.game.config.mainLevel = 2;
    expect(await run(ctx)).toBe('level');
    expect(ctx.game.config.nextLevel).toBe(5);
    expect(ctx.game.config.levelName).toBe('TWO      ');
  });

  it('mainLevel 0 reads from the first line of the file', async () => {
    const ctx = makeCtx([LEVEL]);
    ctx.game.config.mainLevel = 0;
    expect(await run(ctx)).toBe('level');
    expect(ctx.game.config.nextLevel).toBe(4);
  });

  it('reading past the end of the script is fatal (fread_die)', async () => {
    const ctx = makeCtx(['*1', ']s[']);
    await expect(run(ctx)).rejects.toThrow(RangeError);
  });

  it('a lone ]J jumps to the section start and stops reading the current section', async () => {
    const ctx = makeCtx(['*1', ']J 002[', L('001', 'NEVER', '01', '01'), '*2', LEVEL]);
    expect(await run(ctx)).toBe('level');
    expect(ctx.game.config.mainLevel).toBe(2);
    expect(ctx.game.config.levelName).toBe('TYRIAN   ');
    expect(ctx.game.scratch.temp).toBe(2);
  });

  it(']2 jumps only in two-player or arcade mode', async () => {
    const lines = ['*1', ']2 002[', L('001', 'ONE', '01', '01'), '*2', LEVEL];
    const ctx = makeCtx(lines);
    await run(ctx);
    expect(ctx.game.config.mainLevel).toBe(1);
    expect(ctx.game.scratch.temp).toBe(2); // temp is written either way
    const ctx2 = makeCtx(lines);
    ctx2.game.config.onePlayerAction = true;
    await run(ctx2);
    expect(ctx2.game.config.mainLevel).toBe(2);
    const ctx3 = makeCtx(lines);
    ctx3.game.config.twoPlayerMode = true;
    await run(ctx3);
    expect(ctx3.game.config.mainLevel).toBe(2);
  });

  it(']w jumps only with the Stalker 21.126 (ship 13)', async () => {
    const lines = ['*1', ']w 002[', L('001', 'ONE', '01', '01'), '*2', LEVEL];
    const ctx = makeCtx(lines);
    await run(ctx);
    expect(ctx.game.config.mainLevel).toBe(1);
    const ctx2 = makeCtx(lines);
    ctx2.game.players[0].items.ship = 13;
    await run(ctx2);
    expect(ctx2.game.config.mainLevel).toBe(2);
  });

  it(']t jumps only when the level timer ran out', async () => {
    const lines = ['*1', ']t 002[', L('001', 'ONE', '01', '01'), '*2', LEVEL];
    const a = makeCtx(lines);
    await run(a);
    expect(a.game.config.mainLevel).toBe(1);
    const b = makeCtx(lines);
    b.game.varz.levelTimer = true;
    b.game.varz.levelTimerCountdown = 5;
    await run(b);
    expect(b.game.config.mainLevel).toBe(1);
    const c = makeCtx(lines);
    c.game.varz.levelTimer = true;
    await run(c);
    expect(c.game.config.mainLevel).toBe(2);
  });

  it(']l jumps when not all players are alive', async () => {
    const lines = ['*1', ']l 002[', L('001', 'ONE', '01', '01'), '*2', LEVEL];
    const a = makeCtx(lines);
    a.game.players[0].isAlive = true;
    await run(a);
    expect(a.game.config.mainLevel).toBe(1);
    const b = makeCtx(lines);
    b.game.players[0].isAlive = false;
    await run(b);
    expect(b.game.config.mainLevel).toBe(2);
    const c = makeCtx(lines);
    c.game.players[0].isAlive = true;
    c.game.config.twoPlayerMode = true;
    c.game.players[1].isAlive = false;
    await run(c);
    expect(c.game.config.mainLevel).toBe(2);
  });

  it(']H jumps below Hard; ]h skips one following line above Normal', async () => {
    const hard = ['*1', ']H[ 002', L('001', 'ONE', '01', '01'), '*2', LEVEL];
    const a = makeCtx(hard);
    a.game.config.initialDifficulty = DIFFICULTY_NORMAL;
    await run(a);
    expect(a.game.config.mainLevel).toBe(2);
    const b = makeCtx(hard);
    b.game.config.initialDifficulty = DIFFICULTY_HARD;
    await run(b);
    expect(b.game.config.mainLevel).toBe(1);

    const h = ['*1', ']h[', L('001', 'EASY', '01', '01'), L('002', 'HARDER', '02', '02')];
    const c = makeCtx(h);
    c.game.config.initialDifficulty = DIFFICULTY_NORMAL;
    await run(c);
    expect(c.game.config.levelName.trim()).toBe('EASY');
    const d = makeCtx(h);
    d.game.config.initialDifficulty = DIFFICULTY_HARD;
    await run(d);
    expect(d.game.config.levelName.trim()).toBe('HARDER');
  });

  it(']s stores the savepoint, ]@ toggles the glow bank, ]x sets extraGame', async () => {
    const ctx = makeCtx(['*1', ']s[', ']@[', ']x[', ']@[', ']@[', LEVEL]);
    ctx.game.config.saveLevel = 9;
    await run(ctx);
    expect(ctx.game.config.saveLevel).toBe(1);
    expect(ctx.game.varz.useLastBank).toBe(true); // toggled three times
    expect(ctx.game.config.extraGame).toBe(true);
  });

  it(']i sets songBuy, ]M plays song n-1', async () => {
    const ctx = makeCtx(['*1', ']i 005[', ']M 016[', LEVEL]);
    const songs: number[] = [];
    ctx.audio = Object.assign(new NullAudio(), { playSong: (n: number) => { songs.push(n); } });
    await run(ctx);
    expect(ctx.game.varz.songBuy).toBe(4);
    expect(songs).toEqual([15]);
    expect(ctx.game.scratch.temp).toBe(16);
  });

  it('timed-battle commands are inert outside timed battle and unported inside it', async () => {
    const lines = ['*1', ']T[ 43 44 45 46 47', ']q[', ']n[', ']S[', LEVEL];
    const ctx = makeCtx(lines);
    expect(await run(ctx)).toBe('level');
    const t = makeCtx(lines);
    t.game.config.timedBattleMode = true;
    await expect(run(t)).rejects.toThrow(/unported/);
  });

  it.each([']g[', ']e[', ']V 001[', ']R 001['])('%s is unported and throws', async (cmd) => {
    await expect(run(makeCtx(['*1', cmd, LEVEL]))).rejects.toThrow(/unported/);
  });
});

describeData('episode script parser: state commands', () => {
  it(']L reads the fixed columns', async () => {
    const ctx = makeCtx(['*1', L('027', 'ASTEROID1', '21', '14')]);
    expect(await run(ctx)).toBe('level');
    const c = ctx.game.config;
    const v = ctx.game.varz;
    expect([c.nextLevel, c.levelName.trimEnd(), v.levelSong, v.lvlFileNum, v.loadLevelOk, c.gameJustLoaded]).toEqual([27, 'ASTEROID1', 21, 14, true, false]);
    expect([v.bonusLevelCurrent, v.normalBonusLevelCurrent]).toEqual([false, false]);
  });

  it(']L: nextLevel 0 means mainLevel+1', async () => {
    const ctx = makeCtx(['*1', '*2', '*3', L('000', 'NAME', '05', '07')]);
    ctx.game.config.mainLevel = 3;
    await run(ctx);
    expect(ctx.game.config.nextLevel).toBe(4);
    expect(ctx.game.config.levelName).toBe('NAME     '); // 9 characters: SDL_strlcpy(levelName, s + 13, 10)
  });

  it(']L: $ markers at columns 27 and 28', async () => {
    const both = makeCtx(['*1', L('004', 'TYRIAN', '18', '09', '$$')]);
    await run(both);
    expect([both.game.varz.normalBonusLevelCurrent, both.game.varz.bonusLevelCurrent]).toEqual([true, true]);
    const one = makeCtx(['*1', L('004', 'TYRIAN', '18', '09', '$')]);
    await run(one);
    expect([one.game.varz.normalBonusLevelCurrent, one.game.varz.bonusLevelCurrent]).toEqual([true, false]);
    // the flags are cleared again by the next plain ]L
    one.game.config.mainLevel = 1;
    useScript(one, ['*1', LEVEL]);
    await run(one);
    expect([one.game.varz.normalBonusLevelCurrent, one.game.varz.bonusLevelCurrent]).toEqual([false, false]);
  });

  it(']G reads the origin, count and planet/section pairs', async () => {
    const ctx = makeCtx(['*1', ']G[ 01 2 02 005  03 006', LEVEL]);
    await run(ctx);
    const v = ctx.game.varz;
    expect([v.mapOrigin, v.mapPNum]).toEqual([1, 2]);
    expect(Array.from(v.mapPlanet.subarray(0, 2))).toEqual([2, 3]);
    expect(Array.from(v.mapSection.subarray(0, 2))).toEqual([5, 6]);
  });

  it(']G with more than 5 planets overflows the C arrays and is refused', async () => {
    await expect(run(makeCtx(['*1', ']G[ 01 6 02 005', LEVEL]))).rejects.toThrow(RangeError);
  });

  it(']? loads the cube list and clamps cubeMax; ]! sets it; ]+ adds with a cap of 4', async () => {
    const ctx = makeCtx(['*1', ']?[ 04 001 002 023 005', LEVEL]);
    ctx.game.config.cubeMax = 9;
    await run(ctx);
    expect(Array.from(ctx.game.config.cubeList)).toEqual([1, 2, 23, 5]);
    expect(ctx.game.config.cubeMax).toBe(4);
    expect(ctx.game.scratch.temp).toBe(4);

    const small = makeCtx(['*1', ']?[ 03 015 013 028', LEVEL]);
    small.game.config.cubeMax = 2;
    await run(small);
    expect(small.game.config.cubeMax).toBe(2); // only clamped down

    const set = makeCtx(['*1', ']![ 03', LEVEL]);
    await run(set);
    expect(set.game.config.cubeMax).toBe(3);

    const add = makeCtx(['*1', ']+[ 2', ']+[ 2', LEVEL]);
    add.game.config.cubeMax = 1;
    await run(add);
    expect(add.game.config.cubeMax).toBe(4);
  });

  it(']b saves slot 11 as LAST LEVEL with the current saveLevel', async () => {
    const ctx = makeCtx(['*1', ']s[', ']b[', LEVEL]);
    ctx.game.config.mainLevel = 1;
    await run(ctx);
    const f = ctx.game.config.saveFiles[10]!;
    expect(saveName(f)).toBe('LAST LEVEL    ');
    expect(f.level).toBe(1);
    expect(ctx.game.scratch.temp).toBe(11);
    const two = makeCtx(['*1', ']b[', LEVEL]);
    two.game.config.twoPlayerMode = true;
    await run(two);
    expect(two.game.scratch.temp).toBe(22); // the dead `temp = 22` store is still visible
  });

  it(']I fills itemAvail from the 9 following lines, then runs the shop', async () => {
    const lines = ['*1', ']I[', ' Ship   1', ' WeapF  13 2 7', ' WeapR  0 11 10 29', ' Power  1 2 3', ' Engine 1', ' Opt1   0 9 16 30', '', ' Armor  1 2 3', ' Shield', LEVEL];
    const ctx = makeCtx(lines);
    ctx.game.items.itemAvail[0]![5] = 77; // memset clears stale entries
    shop.impl = () => { expect(ctx.game.items.itemAvailMax[1]).toBe(3); };
    await run(ctx);
    expect(shop.calls).toBe(1);
    const a = ctx.game.items;
    expect(Array.from(a.itemAvailMax)).toEqual([1, 3, 4, 3, 1, 4, 0, 3, 0]);
    expect(Array.from(a.itemAvail[1]!.subarray(0, 4))).toEqual([13, 2, 7, 0]);
    expect(Array.from(a.itemAvail[2]!.subarray(0, 5))).toEqual([0, 11, 10, 29, 0]);
    expect(a.itemAvail[0]![5]).toBe(0);
  });

  it(']I rows beyond itemAvail[9][10] are refused', async () => {
    const lines = ['*1', ']I[', ' Ship   1 2 3 4 5 6 7 8 9 10 11', ...Array(8).fill(''), LEVEL];
    await expect(run(makeCtx(lines))).rejects.toThrow(RangeError);
  });

  it('a shop that loaded a game restarts the script (gameLoaded), or returns when mainLevel is 0', async () => {
    const lines = ['*1', ']I[', ...Array(9).fill(''), LEVEL];
    const restart = makeCtx(lines);
    shop.impl = () => { restart.game.varz.gameLoaded = true; restart.game.config.mainLevel = 4; };
    expect(await run(restart)).toBe('restart');

    const quit = makeCtx(lines);
    shop.impl = () => { quit.game.varz.gameLoaded = true; quit.game.config.mainLevel = 0; };
    expect(await run(quit)).toBe('return');
  });

  it('a shop that jumps (planet choice) continues in the chosen section', async () => {
    const lines = ['*1', ']I[', ...Array(9).fill(''), L('001', 'NEVER', '01', '01'), '*2', LEVEL];
    const ctx = makeCtx(lines);
    shop.impl = () => { ctx.game.config.mainLevel = 2; ctx.game.varz.jumpSection = true; };
    expect(await run(ctx)).toBe('level');
    expect(ctx.game.config.levelName).toBe('TYRIAN   ');
  });
});

const KEY = { type: 'keydown', scancode: 44, mod: 0 } as const;
const frames = (ctx: Ctx): { n: number } => { const f = { n: 0 }; ctx.frameSink = () => { f.n++; }; return f; };

describeData('episode script parser: picture and fade commands', () => {
  it(']P n loads picture n with its palette and fades to it in 10 steps', async () => {
    const ctx = makeCtx(['*1', ']P 005[', LEVEL]);
    const f = frames(ctx);
    await run(ctx);
    const ref = createSurface();
    const refCtx = makeCtx([]);
    loadPic(refCtx.assets.pics, refCtx.palette, ref, 5, false);
    expect(ctx.vga.screen.pixels).toEqual(ref.pixels);
    expect(ctx.palette.colors).toEqual(refCtx.palette.colors);
    expect(ctx.palette.current).toEqual(ctx.palette.colors); // fade_palette(colors, 10, ...) converged
    expect(f.n).toBe(1 + 10);
  });

  it(']P 000 loads tshp2.pcx and takes the palette from the file', async () => {
    const ctx = makeCtx(['*1', ']P 000[', LEVEL]);
    await run(ctx);
    const ref = createSurface();
    const colors = new Uint8Array(768);
    loadPCX(ctx.assets.archive.get('tshp2.pcx'), ref, colors);
    expect(ctx.vga.screen.pixels).toEqual(ref.pixels);
    expect(ctx.palette.colors).toEqual(colors);
  });

  it(']P 9xx clears the screen and fades to palette pcxpal[x-1-900] in one step', async () => {
    const ctx = makeCtx(['*1', ']P 906[', LEVEL]);
    ctx.vga.screen.pixels.fill(9);
    const f = frames(ctx);
    await run(ctx);
    expect(ctx.vga.screen.pixels.every((p) => p === 0)).toBe(true);
    expect(ctx.palette.colors).toEqual(ctx.assets.palettes[PCX_PAL[5]!]!); // pcxpal[x - 1 - 900]
    expect(f.n).toBe(1 + 1);
  });

  it(']U reveals the picture from the bottom over 200 frames and leaves it on the screen', async () => {
    const ctx = makeCtx(['*1', ']U 005[', LEVEL]);
    ctx.vga.screen.pixels.fill(7);
    const f = frames(ctx);
    const seen: number[] = [];
    ctx.frameSink = (s) => { f.n++; if (f.n === 1) seen.push(s.pixels[0]!, s.pixels[199 * 320]!); };
    await run(ctx);
    const ref = createSurface();
    loadPic(ctx.assets.pics, ctx.palette, ref, 5, false);
    expect(ctx.vga.screen.pixels).toEqual(ref.pixels);
    expect(f.n).toBe(200);
    // first frame (z = 0): row 0 shows picture row 199, the rest still the old screen
    expect(seen[0]).toBe(ref.pixels[199 * 320]);
    expect(seen[1]).toBe(7);
  });

  it(']U stops animating when a key is down, but still ends on the picture', async () => {
    const ctx = makeCtx(['*1', ']U 005[', LEVEL]);
    ctx.input.push(KEY);
    const f = frames(ctx);
    await run(ctx);
    const ref = createSurface();
    loadPic(ctx.assets.pics, ctx.palette, ref, 5, false);
    expect(ctx.vga.screen.pixels).toEqual(ref.pixels);
    expect(f.n).toBe(0);
  });

  it(']C fades to black, clears and installs palette 7; ]B fades to black; ]F fades through white to black', async () => {
    const c = makeCtx(['*1', ']C[', LEVEL]);
    c.vga.screen.pixels.fill(3);
    c.palette.current.fill(200);
    await run(c);
    expect(c.vga.screen.pixels.every((p) => p === 0)).toBe(true);
    expect(c.palette.colors).toEqual(c.assets.palettes[7]!);
    expect(c.palette.current).toEqual(c.assets.palettes[7]!);

    const b = makeCtx(['*1', ']B[', LEVEL]);
    b.palette.current.fill(200);
    b.vga.screen.pixels.fill(3);
    const fb = frames(b);
    await run(b);
    expect(b.palette.current.every((x) => x === 0)).toBe(true);
    expect(fb.n).toBe(10);
    expect(b.vga.screen.pixels[0]).toBe(3);

    const f = makeCtx(['*1', ']F[', LEVEL]);
    f.vga.screen.pixels.fill(3);
    const ff = frames(f);
    await run(f);
    expect(f.palette.current.every((x) => x === 0)).toBe(true);
    expect(f.vga.screen.pixels.every((p) => p === 0)).toBe(true);
    expect(ff.n).toBe(100 + 30 + 1);
  });

  it(']A plays tyrend.anm (a key ends it after the first frame)', async () => {
    const ctx = makeCtx(['*1', ']A[', LEVEL]);
    ctx.input.push(KEY);
    const f = frames(ctx);
    await run(ctx);
    expect(f.n).toBe(2);
  });
});

describeData('episode script parser: text screens', () => {
  const textLines = ['Warning:', 'second line', '', 'last'];

  it(']W collects lines up to # and shows them (key dismisses)', async () => {
    const ctx = makeCtx(['*1', ']Wy 00[', ...textLines, '#', LEVEL]);
    ctx.input.push(KEY);
    await run(ctx);
    const t = ctx.game.text;
    expect(t.levelWarningLines).toBe(4);
    expect(t.levelWarningText.slice(0, 4)).toEqual(textLines);
    expect(t.warningRed).toBe(false);
    expect(t.levelWarningDisplay).toBe(false); // JE_displayText clears it at the end
    expect(ctx.game.varz.warningSoundDelay).toBeGreaterThanOrEqual(0);
    expect(ctx.input.newkey).toBe(false);
  });

  it(']W: the number is warningRed * 10 + frameCountMax', async () => {
    const ctx = makeCtx(['*1', ']Wn 20[', 'x', '#', LEVEL]);
    ctx.input.push(KEY);
    await run(ctx);
    expect(ctx.game.text.warningRed).toBe(true);
    expect(ctx.game.config.frameCountMax).toBe(0);
    const ctx2 = makeCtx(['*1', ']Wn 10[', 'x', '#', LEVEL]);
    ctx2.input.push(KEY);
    await run(ctx2);
    expect(ctx2.game.text.warningRed).toBe(true);
    expect(ctx2.game.config.frameCountMax).toBe(0);
  });

  it(']W draws the text on the screen', async () => {
    const ctx = makeCtx(['*1', ']Wn 00[', 'Warning:', '#', LEVEL]);
    ctx.vga.screen.pixels.fill(0);
    ctx.input.push(KEY);
    await run(ctx);
    expect(ctx.vga.screen.pixels.some((p) => p !== 0)).toBe(true);
  });

  it(']W with more than 12 rows is refused', async () => {
    const ctx = makeCtx(['*1', ']Wn 00[', ...Array(13).fill('row'), '#', LEVEL]);
    await expect(run(ctx)).rejects.toThrow(RangeError);
  });

  it(']Q picks text block secretHint + 3 * (rand % 3), writes the score header, then ends the episode', async () => {
    const blocks = Array.from({ length: 9 }, (_, k) => [`block ${k + 1} a`, `block ${k + 1} b`, '#']).flat();
    const lines = ['*1', ']Q[', ...blocks, LEVEL];
    const ctx = makeCtx(lines);
    const predict = makeCtx(lines);
    const draw = predict.rng.rand() % 3;
    const expectBlock = predict.game.config.secretHint + draw * 3;
    ctx.frameSink = () => ctx.input.push(KEY); // a key every frame: skips the glow animation and dismisses the screen
    await expect(run(ctx)).rejects.toThrow(/JE_nextEpisode/);
    const t = ctx.game.text;
    expect(t.levelWarningText[0]).toBe(`${ctx.assets.helpText.miscText[37]} ${totalScore(ctx, ctx.game.players[0])}`);
    expect(t.levelWarningText[1]).toBe('');
    expect(t.levelWarningText.slice(2, 5)).toEqual([`block ${expectBlock} a`, `block ${expectBlock} b`, '#']);
    expect(t.levelWarningLines).toBe(4);
  });
});
