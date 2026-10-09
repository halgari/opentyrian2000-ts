import { expect, it } from 'vitest';
import { DemoReader, parseDemo } from '../../src/data/demo-file';
import { loadNextDemo, replayDemoKeys } from '../../src/game/demo';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

/** 32-byte header (initial wait big-endian at 30..31) followed by 3-byte records {keys, wait hi, wait lo}. */
function demoBytes(initialWait: number, records: [number, number][], trailing = 1): Uint8Array {
  const out = new Uint8Array(32 + records.length * 3 + trailing);
  out[30] = initialWait >> 8; out[31] = initialWait & 0xff;
  records.forEach(([keys, wait], i) => { out[32 + i * 3] = keys; out[33 + i * 3] = wait >> 8; out[34 + i * 3] = wait & 0xff; });
  return out;
}

describeData('replayDemoKeys', () => {
  it('applies key bits to player 0 and the button array, counting waits down per frame', () => {
    const ctx = testCtx()!;
    const g = ctx.game;
    g.demo.demoFile = new DemoReader(parseDemo(demoBytes(2, [[0b0001_1001, 2], [0b1110_0110, 1]])));
    g.players[0].x = 100; g.players[0].y = 100;

    expect(replayDemoKeys(ctx)).toBe(true); // initial wait 2: keys 0
    expect(replayDemoKeys(ctx)).toBe(true);
    expect([g.players[0].x, g.players[0].y]).toEqual([100, 100]);
    expect(g.varz.button).toEqual([false, false, false, false]);

    // record 1: bit0 (up) + bit3 (right) + bit4 (button 0), twice
    expect(replayDemoKeys(ctx)).toBe(true);
    expect(replayDemoKeys(ctx)).toBe(true);
    expect([g.players[0].x, g.players[0].y]).toEqual([102, 98]);
    expect(g.varz.button).toEqual([true, false, false, false]);

    // record 2: bit1 (down) + bit2 (left) + bit5 -> button[3], bit6 -> button[1], bit7 -> button[2]
    expect(replayDemoKeys(ctx)).toBe(true);
    expect([g.players[0].x, g.players[0].y]).toEqual([101, 99]);
    expect(g.varz.button).toEqual([false, true, true, true]);
    expect(g.demo.demoKeys).toBe(0b1110_0110);

    // out of records (the 1 trailing byte is a short read): replay_demo_keys returns false, demo_keys = 0
    expect(replayDemoKeys(ctx)).toBe(false);
    expect(g.demo.demoKeys).toBe(0);
  });
});

describeData('loadNextDemo', () => {
  it('cycles demo.1..5 and applies the demo.1 header to the world', () => {
    const ctx = testCtx()!;
    const g = ctx.game;
    g.config.difficultyLevel = 7;
    expect(loadNextDemo(ctx)).toBe(true);
    expect(g.demo.demoNum).toBe(1);
    expect(g.config.difficultyLevel).toBe(2); // DIFFICULTY_NORMAL
    expect(g.items.episodeNum).toBe(1);
    expect(g.items.episodeFile).toBe('levels1.dat');
    expect(g.config.levelName.trim()).toBe('TYRIAN');
    expect(g.varz.lvlFileNum).toBe(9);
    const it0 = g.players[0].items;
    expect([it0.ship, it0.weapon[0].id, it0.weapon[1].id, it0.shield, it0.special]).toEqual([1, 7, 29, 6, 0]);
    expect(it0.sidekick).toEqual([21, 20]);
    expect([it0.weapon[0].power, it0.weapon[1].power]).toEqual([1, 1]);
    expect(g.varz.levelSong).toBe(18);
    // JE_loadItemDat ran: tables are populated
    expect(g.items.ships[1]!.dmg).toBeGreaterThan(0);
    expect(g.items.weapons[7]!.drain).toBeGreaterThanOrEqual(0);
    expect(g.items.shields[6]!.mpwr).toBeGreaterThan(0);

    for (let n = 2; n <= 5; n++) { loadNextDemo(ctx); expect(g.demo.demoNum).toBe(n); }
    loadNextDemo(ctx);
    expect(g.demo.demoNum).toBe(1); // ++demo_num > 5 -> 1
  });

  it('loads item data only once per episode (JE_initEpisode early-out)', () => {
    const ctx = testCtx()!;
    loadNextDemo(ctx);
    const ships = ctx.game.items.ships;
    loadNextDemo(ctx);
    expect(ctx.game.items.ships).toBe(ships); // same array object: not reloaded
  });
});
