import { describe, expect, it } from 'vitest';
import { drawCube, endLevelAni } from '../../src/screens/endlevel';
import { textState } from '../../src/video/glow-text';
import { createSurface } from '../../src/video/surface';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('endLevelAni (mainint.c:2689)', () => {
  function setup() {
    const ctx = testCtx()!;
    const g = ctx.game;
    g.config.initialDifficulty = 2;
    g.config.difficultyLevel = 0;
    g.config.levelName = 'TESTLVL';
    g.config.cubeMax = 2;
    g.config.editorLevel = 65530;
    g.enemies.totalEnemy = 7;
    g.enemies.enemyKilled = 4; // 400/7 = 57
    g.players[0].isAlive = true;
    g.players[0].cash = 12345;
    g.players[0].items.special = 3;
    g.players[0].items.weapon[0]!.id = 11;
    g.players[0].items.weapon[0]!.power = 1;
    g.players[0].items.weapon[1]!.power = 1;
    g.players[0].items.sidekick = [5, 6];
    const frames: { n: number; pal254: number[] } = { n: 0, pal254: [] };
    ctx.frameSink = (_s, pal) => {
      if (frames.n++ === 0) frames.pal254 = Array.from(pal.subarray(254 * 3, 255 * 3));
    };
    // The first key cuts the glow animation (JE_anyButton sees it on frame 1); the "press a key" wait
    // does not show frames, so a second key arrives by virtual time.
    ctx.input.push({ type: 'keydown', scancode: 4, mod: 0 });
    const sleep = ctx.clock.sleep.bind(ctx.clock);
    let pushed = false;
    ctx.clock.sleep = async (ms: number) => {
      await sleep(ms);
      if (!pushed && ctx.clock.now() >= 1000) {
        pushed = true;
        ctx.input.push({ type: 'keyup', scancode: 4 });
        ctx.input.push({ type: 'keydown', scancode: 5, mod: 0 });
      }
    };
    return { ctx, frames };
  }

  it('runs the tally, applies side effects and ends on fade_black + clear', async () => {
    const { ctx, frames } = setup();
    const granted: number[] = [];
    await endLevelAni(ctx, (o) => granted.push(o));
    const g = ctx.game;
    expect(g.config.lastLevelName).toBe('TESTLVL');
    expect(g.players[0].lastItems.weapon[0]!.id).toBe(11);
    expect(g.config.editorLevel).toBe((65530 + Math.trunc(57 / 5)) & 0xffff);
    expect(g.config.difficultyLevel).toBe(1); // score ~12345*0.8 < 40000
    expect(g.scratch.temp2).toBe(160);
    expect(textState(ctx).textGlowFont).toBe(1);
    expect(frames.pal254).toEqual([255, 255, 255]); // set_colors(white, 254, 254), faded out at the end
    expect(granted.slice(0, 3)).toEqual([81 + 3, 11, 0]);
    expect(granted).toContain(51 + 5);
    expect(granted).toContain(51 + 6);
    expect(granted.length).toBe(1 + 2 * 4);
    expect(ctx.vga.screen.pixels.every((v) => v === 0)).toBe(true);
    // Frames: first glow line 12 rising + 1 falling (frameCountMax 4 on entry), then every later glow line 1 frame:
    // Completed(13) + cash(1) + percent(1) + "Cubes"(1) + 2 cubes * (1 + 26 + 11) + "press a key"(1) + fade_black(15)
    expect(frames.n).toBe(13 + 1 + 1 + 1 + 2 * 38 + 1 + 15);
  });

  it('caps cubeMax at 4, and prints the "no cubes" line when there are none', async () => {
    const a = setup();
    a.ctx.game.config.cubeMax = 9;
    await endLevelAni(a.ctx);
    expect(a.ctx.game.config.cubeMax).toBe(4);
    expect(a.frames.n).toBe(13 + 1 + 1 + 1 + 4 * 38 + 1 + 15);

    const b = setup();
    b.ctx.game.config.cubeMax = 0;
    await endLevelAni(b.ctx);
    expect(b.frames.n).toBe(13 + 1 + 1 + 1 + 1 + 1 + 15); // + "no cubes" line
  });

  it('onePlayerAction skips the cube section; a dead player shows "Exiting"', async () => {
    const { ctx, frames } = setup();
    ctx.game.config.onePlayerAction = true;
    ctx.game.players[0].isAlive = false;
    await endLevelAni(ctx);
    expect(frames.n).toBe(13 + 1 + 1 + 1 + 15);
  });

  it('throws on the unported two-player and timed-battle branches', async () => {
    const { ctx } = setup();
    ctx.game.config.twoPlayerMode = true;
    await expect(endLevelAni(ctx)).rejects.toThrow(/unported/);
  });

  it.todo('HASH golden: end-level screen from an oracle scenario (Task 1 discover.ts) — add once the scenario exists');
});

describe('drawCube (mainint.c:2905)', () => {
  it('draws two dark shadows at (+4,+4)/(+3,+3) and the filtered cube on top', () => {
    const s = createSurface();
    s.pixels.fill(0x4f);
    // synthetic: option-shape table with sprite 25 = single pixel
    const table = { count: 30, sprites: Array.from({ length: 152 }, () => ({ width: 0, height: 0, size: 0, data: null as Uint8Array | null })) };
    table.sprites[25] = { width: 1, height: 1, size: 1, data: Uint8Array.of(0x0a) };
    const ctx = { assets: { shapes: { tables: [0, 0, 0, 0, 0, table] } } } as never;
    drawCube(ctx, s, 10, 10, 9, 0);
    expect(s.pixels[14 * 320 + 14]).toBe(0x47); // darkened once (x+4, y+4)
    expect(s.pixels[13 * 320 + 13]).toBe(0x47);
    expect(s.pixels[10 * 320 + 10]).toBe(0x90 | 0x0a);
  });
});
