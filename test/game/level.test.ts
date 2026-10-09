import { expect, it } from 'vitest';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { allPlayersDead, loadMap, runLevel, starShowVGA } from '../../src/game/level';
import { SHAPE_BYTES } from '../../src/game/world';
import { describeData } from '../helpers/data';
import { testCtx as rawTestCtx } from '../helpers/ctx';

/** A ctx in the state runGame leaves it in when the title screen selects Demo. */
function testCtx() {
  const ctx = rawTestCtx()!;
  loadConfigurationDefaults(ctx);
  initPlayerData(ctx);
  return ctx;
}

const EXPECTED_EVENTS = [1010, 832, 379, 517, 552]; // survey 1.5: events per demo level

describeData('loadMap (demo branch)', () => {
  it.each([1, 2, 3, 4, 5])('installs demo %i: events, sentinel, map slots and tile bytes', (n) => {
    const ctx = testCtx();
    const g = ctx.game;
    ctx.state.playDemo = true;
    g.demo.demoNum = n - 1;
    loadMap(ctx);
    expect(g.demo.demoNum).toBe(n);

    expect(g.events.maxEvent).toBe(EXPECTED_EVENTS[n - 1]);
    expect(g.events.eventRec[g.events.maxEvent]!.eventtime).toBe(65500);
    expect(g.events.eventRec[0]!.eventtime).toBeLessThanOrEqual(g.events.eventRec[g.events.maxEvent - 1]!.eventtime);
    expect(g.events.levelEnemyMax).toBeGreaterThan(0);
    expect(g.backgrounds.mapX).toBeGreaterThan(0);

    // every map slot is a valid shape slot index or NULL (-1); referenced slots hold tile bytes
    const check = (md: typeof g.map.megaData1, stride: number, off: number, slots: number, mustHaveTiles: boolean): void => {
      let nonNull = 0;
      for (const slot of md.mainmap) {
        expect(slot).toBeGreaterThanOrEqual(-1);
        expect(slot).toBeLessThan(slots);
        if (slot >= 0) {
          nonNull++;
          const base = slot * stride + off;
          expect(base + SHAPE_BYTES).toBeLessThanOrEqual(md.shapes.length);
        }
      }
      if (mustHaveTiles) expect(nonNull).toBeGreaterThan(0);
    };
    // layers 2 and 3 can be entirely NULL in a level (e.g. a level with no second background)
    check(g.map.megaData1, SHAPE_BYTES, 0, 72, true);
    check(g.map.megaData2, 4 + SHAPE_BYTES, 4, 71, false);
    check(g.map.megaData3, 4 + SHAPE_BYTES, 4, 70, false);
    // layer-1 tile pixels were copied (some referenced shape has non-zero bytes)
    expect(g.map.megaData1.shapes.some((b) => b !== 0)).toBe(true);
    expect(g.scratch.temp).toBe(3);
    expect(g.scratch.temp2).toBe(128);
  });

  it('refuses the non-demo path', () => {
    const ctx = testCtx();
    ctx.state.playDemo = false;
    expect(() => loadMap(ctx)).toThrow(/unported/);
  });
});

describeData('starShowVGA', () => {
  it('copies the 264x184 play window from game_screen (24,0) to the screen (0,0) and presents one frame', async () => {
    const ctx = testCtx();
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    ctx.game.config.smoothScroll = false;
    const gs = ctx.vga.gameScreen, sc = ctx.vga.screen;
    for (let i = 0; i < gs.pixels.length; i++) gs.pixels[i] = (i * 7 + (i >> 8)) & 0xff;
    sc.pixels.fill(0x55);
    await starShowVGA(ctx);
    expect(frames).toBe(1);
    for (const [x, y] of [[0, 0], [263, 0], [0, 183], [263, 183], [100, 90]] as const) {
      expect(sc.pixels[y * 320 + x]).toBe(gs.pixels[y * 320 + x + 24]);
    }
    expect(sc.pixels[0 * 320 + 264]).toBe(0x55); // HUD columns untouched
    expect(sc.pixels[184 * 320 + 10]).toBe(0x55); // HUD rows untouched
    expect(ctx.game.varz.skipStarShowVGA).toBe(false);
  });

  it('paces with the plain wait_delay: waits out the remaining delay, then re-arms frameCountMax', async () => {
    const ctx = testCtx();
    ctx.game.config.smoothScroll = true;
    ctx.game.config.frameCountMax = 2;
    ctx.delay.setDelaySpeed(0x4300);
    ctx.delay.setDelay(2);
    const t0 = ctx.clock.now();
    await starShowVGA(ctx);
    expect(ctx.clock.now()).toBeGreaterThan(t0);
    expect(ctx.delay.remaining()).toBeGreaterThan(0); // setDelay(frameCountMax) for the next frame
  });

  it('is skipped entirely when playerEndLevel is set', async () => {
    const ctx = testCtx();
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    ctx.game.varz.playerEndLevel = true;
    ctx.game.varz.skipStarShowVGA = true;
    await starShowVGA(ctx);
    expect(frames).toBe(0);
    expect(ctx.game.varz.skipStarShowVGA).toBe(false); // always cleared
  });
});

describeData('runLevel (skeleton loop)', () => {
  /** Runs a level until `abortAtFrame` presented frames, then queues a key press (the demo-abort path). */
  async function runAborted(abortAfterLevelFrames: number) {
    const ctx = testCtx();
    ctx.state.playDemo = true;
    ctx.game.demo.demoNum = 0; // demo.1
    let frames = 0;
    ctx.frameSink = () => {
      frames++;
      if (frames === 51 + abortAfterLevelFrames) {
        ctx.input.push({ type: 'keydown', scancode: 4, mod: 0 });
        ctx.input.push({ type: 'keyup', scancode: 4 }); // wait_noinput after the demo waits for the release
      }
    };
    await runLevel(ctx);
    return { ctx, frames };
  }

  it('sets the level up like JE_main and presents 1 + 50 start frames before the loop', async () => {
    const { ctx, frames } = await runAborted(3);
    // 1 (HUD frame) + 50 (fade) + 3 loop frames; the key queued while the 3rd was presented is seen by the 4th
    // iteration's abort check, which still presents its frame (the check precedes JE_starShowVGA); then
    // fade_black(10) of the epilogue
    expect(frames).toBe(51 + 4 + 10);
    const g = ctx.game;
    expect(g.varz.levelEnd).toBe(255);
    expect(g.events.levelEnemyFrequency).toBe(96);
    expect(g.events.curLoc).toBe(4); // advanceBackgrounds ran in each of the 4 iterations
    expect(g.events.eventLoc).toBeGreaterThan(1); // stub eventSystem advanced past the time-0 events
    expect(g.backgrounds.backPos).toBe(4);
    expect(g.backgrounds.mapY).toBe(292);
    expect(g.map.BKwrap1).toBe(14);
    expect(g.config.shieldT).toBe(g.items.shields[6]!.tpwr * 20);
    expect(g.players[0].shield).toBe(g.items.shields[6]!.mpwr);
    expect(g.players[0].shieldMax).toBe(g.players[0].shield * 2);
    expect(g.enemies.enemyAvail.every((a) => a === 1)).toBe(true);
    expect(g.enemyShots.enemyShotAvail.every((a) => a)).toBe(true);
    expect(Array.from(g.config.shotRepeat)).toEqual(new Array(11).fill(1));
    expect(g.sprites.explosionSpriteSheet).not.toBeNull();
    expect(g.config.levelBrightness).toBe(-14);
  });

  it('ends on a key press during the demo and runs the start_level epilogue', async () => {
    const { ctx, frames } = await runAborted(5);
    const g = ctx.game;
    expect(g.demo.stoppedDemo).toBe(true);
    expect(g.varz.reallyEndLevel).toBe(true);
    expect(g.demo.demoFile).toBeNull();
    expect(ctx.state.moveTyrianLogoUp).toBe(true);
    expect(g.config.difficultyLevel).toBe(g.config.oldDifficultyLevel);
    expect(g.sprites.enemySpriteSheets.every((s) => s === null)).toBe(true);
    // epilogue: fade_black(10) presents 10 more frames
    expect(frames).toBe(51 + 6 + 10);
  });

  it('runs a demo to its natural end: replay EOF sets endLevel, levelEnd counts down, reallyEndLevel', async () => {
    const ctx = testCtx();
    ctx.state.playDemo = true;
    ctx.game.demo.demoNum = 3; // demo.4 (shortest, ~1.7k frames)
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    await runLevel(ctx);
    expect(ctx.game.varz.endLevel).toBe(true);
    expect(ctx.game.demo.stoppedDemo).toBe(false);
    // 51 start + ~1702 demo frames + <= 41 end warp + 10 exit fade
    expect(frames).toBeGreaterThan(1702);
    expect(frames).toBeLessThan(1702 + 51 + 45 + 10 + 5);
  });

  it('refuses to run outside demo playback', async () => {
    const ctx = testCtx();
    ctx.state.playDemo = false;
    await expect(runLevel(ctx)).rejects.toThrow(/unported/);
  });
});

describeData('allPlayersDead', () => {
  it('is true only when player 0 is dead (one-player) or both are (two-player)', () => {
    const ctx = testCtx();
    const g = ctx.game;
    g.players[0].isAlive = true; g.players[1].isAlive = false;
    expect(allPlayersDead(g)).toBe(false);
    g.players[0].isAlive = false;
    expect(allPlayersDead(g)).toBe(true);
    g.config.twoPlayerMode = true;
    g.players[1].isAlive = true;
    expect(allPlayersDead(g)).toBe(false);
  });
});
