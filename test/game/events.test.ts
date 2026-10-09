import { describe, expect, it, vi } from 'vitest';
import { MersenneTwister } from '../../src/core/mtrand';
import type { Ctx } from '../../src/ctx';
import { eventSystem } from '../../src/game/events';
import { createGameWorld, EventRec, newEnemyDatType, SHOT_SPECIAL, SHOT_SPECIAL2 } from '../../src/game/world';
import { createSurface } from '../../src/video/surface';
import { V_DANGER } from '../../src/audio/ids';
import { drawTextWindow } from '../../src/game/hud';

vi.mock('../../src/game/hud', () => ({ drawTextWindow: vi.fn() }));

type Rec = Partial<EventRec> & { eventtype: number };

function mk(seed = 7) {
  const rng = new MersenneTwister();
  rng.srand(seed);
  const game = createGameWorld();
  game.enemies.enemyAvail.fill(1); // JE_main start: all slots free
  const audio = { playSong: vi.fn(), setVolume: vi.fn() };
  const ctx = {
    rng, game, audio,
    vga: { screen: createSurface(), screen2: createSurface(), gameScreen: createSurface() },
    assets: { helpText: { outputs: Array.from({ length: 9 }, (_, i) => `out${i}`) } },
  } as unknown as Ctx;
  return { ctx, g: game, audio };
}

/** puts `rec` at eventRec[0], sets eventLoc = 1 and runs one JE_eventSystem */
function run(ctx: Ctx, rec: Rec): EventRec {
  const ev = ctx.game.events;
  const r = Object.assign(ev.eventRec[0]!, new EventRec(), rec);
  ev.eventLoc = 1;
  eventSystem(ctx);
  return r;
}

function live(g: ReturnType<typeof mk>['g'], i: number, over: Record<string, number> = {}): void {
  g.enemies.enemyAvail[i] = 0;
  Object.assign(g.enemies.enemy[i]!, over);
}

describe('eventSystem: simple state events (table)', () => {
  type Row = [string, Rec, (g: ReturnType<typeof mk>['g']) => unknown, unknown, ((g: ReturnType<typeof mk>['g']) => void)?];
  const rows: Row[] = [
    ['1 starfield speed', { eventtype: 1, eventdat: 5 }, (g) => g.backgrounds.starfieldSpeed, 5],
    ['8 star off', { eventtype: 8 }, (g) => g.config.starActive, false, (g) => { g.config.starActive = true; }],
    ['9 star on', { eventtype: 9 }, (g) => g.config.starActive, true],
    ['13 enemies off', { eventtype: 13 }, (g) => g.varz.enemiesActive, false, (g) => { g.varz.enemiesActive = true; }],
    ['14 enemies on', { eventtype: 14 }, (g) => g.varz.enemiesActive, true],
    ['21 bg3over 1', { eventtype: 21 }, (g) => g.config.background3over, 1],
    ['22 bg3over 0', { eventtype: 22 }, (g) => g.config.background3over, 0, (g) => { g.config.background3over = 1; }],
    ['42 bg3over 2', { eventtype: 42 }, (g) => g.config.background3over, 2],
    ['26 smallEnemyAdjust', { eventtype: 26, eventdat: 1 }, (g) => g.varz.smallEnemyAdjust, true],
    ['28 topEnemyOver off', { eventtype: 28 }, (g) => g.config.topEnemyOver, false, (g) => { g.config.topEnemyOver = true; }],
    ['29 topEnemyOver on', { eventtype: 29 }, (g) => g.config.topEnemyOver, true],
    ['36 readyToEndLevel', { eventtype: 36 }, (g) => g.varz.readyToEndLevel, true],
    ['37 level enemy freq', { eventtype: 37, eventdat: 33 }, (g) => g.events.levelEnemyFrequency, 33],
    ['40 continual damage', { eventtype: 40 }, (g) => g.varz.enemyContinualDamage, true],
    ['43 bg2over', { eventtype: 43, eventdat: 2 }, (g) => g.config.background2over, 2],
    ['48 bg2 not transparent', { eventtype: 48 }, (g) => g.config.background2notTransparent, true],
    ['53 forceEvents', { eventtype: 53, eventdat: 0 }, (g) => g.varz.forceEvents, true],
    ['53 forceEvents off at 99', { eventtype: 53, eventdat: 99 }, (g) => g.varz.forceEvents, false, (g) => { g.varz.forceEvents = true; }],
    ['57 superEnemy254Jump', { eventtype: 57, eventdat: 321 }, (g) => g.enemies.superEnemy254Jump, 321],
    ['62 sound effect', { eventtype: 62, eventdat: 12 }, (g) => g.varz.soundQueue[3], 12],
    ['65 background3x1', { eventtype: 65, eventdat: 0 }, (g) => g.varz.background3x1, true],
    ['72 background3x1b', { eventtype: 72, eventdat: 1 }, (g) => g.varz.background3x1b, true],
    ['73 skyEnemyOverAll', { eventtype: 73, eventdat: 1 }, (g) => g.config.skyEnemyOverAll, true],
    ['76 returnActive', { eventtype: 76 }, (g) => g.events.returnActive, true],
    ['79 boss bar links', { eventtype: 79, eventdat: 3, eventdat2: 4 }, (g) => g.enemies.bossBar.map((b) => b.linkNum), [3, 4]],
    ['99 randomExplosions', { eventtype: 99, eventdat: 1 }, (g) => g.varz.randomExplosions, true],
    ['67 level timer', { eventtype: 67, eventdat: 1, eventdat2: 9, eventdat3: 5 }, (g) => [g.varz.levelTimer, g.varz.levelTimerCountdown, g.varz.levelTimerJumpTo], [true, 500, 9]],
    ['84 timed battle timer (ignored w/o mode)', { eventtype: 84, eventdat: 1, eventdat3: 5 }, (g) => g.varz.levelTimer, false],
    ['78 galagaShotFreq cap', { eventtype: 78 }, (g) => g.varz.galagaShotFreq, 10, (g) => { g.varz.galagaShotFreq = 10; }],
    ['82 special weapon', { eventtype: 82, eventdat: 7 }, (g) => [g.players[0].items.special, g.config.shotRepeat[SHOT_SPECIAL], g.config.shotMultiPos[SHOT_SPECIAL2]], [7, 0, 0],
      (g) => { g.config.shotRepeat[SHOT_SPECIAL] = 3; g.config.shotMultiPos[SHOT_SPECIAL2] = 3; g.config.shotRepeat[SHOT_SPECIAL2] = 3; }],
    ['69 invulnerable ticks', { eventtype: 69, eventdat: 50 }, (g) => g.players.map((p) => p.invulnerableTicks), [50, 50]],
    ['44 filter', { eventtype: 44, eventdat: 2, eventdat2: -3, eventdat3: -14, eventdat4: 5, eventdat5: 1, eventdat6: 0 },
      (g) => [g.config.filterActive, g.config.filterFade, g.config.levelFilter, g.config.levelBrightness, g.config.levelFilterNew, g.config.levelBrightnessChg, g.config.filterFadeStart],
      [true, true, -3, -14, 5, 1, true]],
    ['41 clear all enemies', { eventtype: 41, eventdat: 0 }, (g) => g.enemies.enemyAvail.every((a) => a === 1), true, (g) => { g.enemies.enemyAvail.fill(0); }],
    ['41 clear sky enemies only', { eventtype: 41, eventdat: 1 }, (g) => [g.enemies.enemyAvail[24], g.enemies.enemyAvail[25], g.scratch.x], [1, 0, 25], (g) => { g.enemies.enemyAvail.fill(0); }],
  ];
  for (const [name, rec, read, want, setup] of rows) {
    it(name, () => {
      const { ctx, g } = mk();
      setup?.(g);
      run(ctx, rec);
      expect(read(g)).toEqual(want);
      expect(g.events.eventLoc).toBe(2);
    });
  }
});

describe('eventSystem: background movement', () => {
  it('2 sets move values, delays and stopBackgroundNum', () => {
    const { ctx, g } = mk();
    g.varz.stopBackgroundNum = 3;
    run(ctx, { eventtype: 2, eventdat: 2, eventdat2: 0, eventdat3: 1 });
    const b = g.backgrounds;
    expect([b.backMove, b.backMove2, b.backMove3, g.varz.explodeMove]).toEqual([2, 0, 1, 2]);
    expect([b.map1YDelay, b.map1YDelayMax, b.map2YDelay, b.map2YDelayMax]).toEqual([1, 1, 1, 1]);
    expect(g.varz.stopBackgroundNum).toBe(0);
  });
  it('2 uses backMove2 for explodeMove when positive, and keeps stopBackgroundNum when backMove is 0', () => {
    const { ctx, g } = mk();
    g.varz.stopBackgroundNum = 3;
    run(ctx, { eventtype: 2, eventdat: 0, eventdat2: 4, eventdat3: -1 });
    expect([g.varz.explodeMove, g.backgrounds.backMove3, g.varz.stopBackgroundNum]).toEqual([4, 0xffff, 3]);
  });
  it('3 resets to the default scroll', () => {
    const { ctx, g } = mk();
    run(ctx, { eventtype: 3 });
    const b = g.backgrounds;
    expect([b.backMove, b.backMove2, b.backMove3, b.map1YDelay, b.map1YDelayMax, b.map2YDelay, b.map2YDelayMax]).toEqual([1, 1, 1, 3, 3, 2, 2]);
  });
  it('30 is 2 without the stopBackground/explodeMove branches', () => {
    const { ctx, g } = mk();
    run(ctx, { eventtype: 30, eventdat: 3, eventdat2: 2, eventdat3: 1 });
    expect([g.backgrounds.backMove, g.varz.explodeMove, g.backgrounds.backMove3]).toEqual([3, 2, 1]);
  });
  it.each([[0, 1], [1, 1], [2, 2], [3, 3]])('4 / 83 map stop with dat %i -> stopBackgroundNum %i', (dat, num) => {
    for (const t of [4, 83]) {
      const { ctx, g } = mk();
      run(ctx, { eventtype: t, eventdat: dat });
      expect([g.varz.stopBackgrounds, g.varz.stopBackgroundNum]).toEqual([true, num]);
    }
  });
  it('4 with an unknown dat leaves stopBackgroundNum', () => {
    const { ctx, g } = mk();
    g.varz.stopBackgroundNum = 9;
    run(ctx, { eventtype: 4, eventdat: 7 });
    expect([g.varz.stopBackgrounds, g.varz.stopBackgroundNum]).toEqual([true, 9]);
  });
});

describe('eventSystem: enemy creation', () => {
  function dat(g: ReturnType<typeof mk>['g'], i: number) {
    g.items.enemyDat[i] = Object.assign(newEnemyDatType(), { armor: 10, esize: 0, ani: 1, startx: 0, starty: 0 });
  }
  it.each([[6, 25], [7, 50], [10, 75], [15, 0]])('type %i creates in the window at %i', (t, ofs) => {
    const { ctx, g } = mk();
    dat(g, 100);
    run(ctx, { eventtype: t, eventdat: 100, eventdat2: 50, eventdat4: 9 });
    expect(g.enemies.enemyAvail[ofs]).toBe(0);
    expect(g.enemies.enemy[ofs]!.linknum).toBe(9);
    expect(g.scratch.b).toBe(ofs + 1);
  });
  it.each([[17, 25, 190], [18, 0, 190], [23, 50, 180]])('type %i places ey at %i + dat5', (t, ofs, base) => {
    const { ctx, g } = mk();
    dat(g, 100);
    run(ctx, { eventtype: t, eventdat: 100, eventdat2: 50, eventdat5: -4 });
    expect(g.enemies.enemy[ofs]!.ey).toBe(base - 4);
  });
  it.each([[32, 50], [56, 75]])('type %i places ey at 190', (t, ofs) => {
    const { ctx, g } = mk();
    dat(g, 100);
    run(ctx, { eventtype: t, eventdat: 100, eventdat2: 50 });
    expect(g.enemies.enemy[ofs]!.ey).toBe(190);
  });
  it('does not touch an enemy when the window is full (b == 0)', () => {
    const { ctx, g } = mk();
    dat(g, 100);
    g.enemies.enemyAvail.fill(0);
    run(ctx, { eventtype: 17, eventdat: 100, eventdat2: 50, eventdat5: 0 });
    expect(g.scratch.b).toBe(0);
    expect(g.enemies.enemy[24]!.ey).toBe(0);
  });
  it('12 builds a 4x4 ground enemy, zeroes eventdat6 and offsets the pieces', () => {
    const { ctx, g } = mk();
    for (let i = 100; i < 104; i++) dat(g, i);
    const r = run(ctx, { eventtype: 12, eventdat: 100, eventdat2: 50, eventdat6: 3 });
    expect(r.eventdat6).toBe(0);
    const e = g.enemies.enemy;
    // window 50 (eventdat6 == 3)
    expect([0, 1, 2, 3].map((i) => g.enemies.enemyAvail[50 + i])).toEqual([0, 0, 0, 0]);
    expect(e[51]!.ex - e[50]!.ex).toBe(24 + 0); // piece 1 is type 101 (same dat) shifted +24
    expect(e[52]!.ey - e[50]!.ey).toBe(-28);
    expect([e[53]!.ex - e[50]!.ex, e[53]!.ey - e[50]!.ey]).toEqual([24, -28]);
  });
  it('12 default and out-of-range dat6 pick sensible windows', () => {
    for (const [d6, ofs] of [[0, 25], [1, 25], [2, 0], [4, 75], [9, 0]] as const) {
      const { ctx, g } = mk();
      for (let i = 100; i < 104; i++) dat(g, i);
      run(ctx, { eventtype: 12, eventdat: 100, eventdat6: d6 });
      expect(g.enemies.enemyAvail[ofs]).toBe(0);
    }
  });
  it.each([[49, 25], [50, 0], [51, 50], [52, 75]])('%i temporarily rewrites dat/dat3/dat6 and enemyDat[0]', (t, ofs) => {
    const { ctx, g } = mk();
    const seen: number[] = [];
    // the enemy template is enemyDat[eventdat(=0) + 0] = enemyDat[0], whose armor/egraphic[0] come from dat6/dat
    const r = run(ctx, { eventtype: t, eventdat: 77, eventdat2: 50, eventdat3: 4, eventdat4: 3, eventdat6: 21 });
    void seen;
    expect(g.items.enemyDat[0]!.armor).toBe(21);
    expect(g.items.enemyDat[0]!.egraphic[0]).toBe(77);
    expect([r.eventdat, r.eventdat3, r.eventdat6]).toEqual([77, 4, 21]);
    expect(g.enemies.enemyAvail[ofs]).toBe(0);
    expect(g.scratch.temp).toBe(ofs);
    expect(g.scratch.tempDat).toBe(4);
  });
  it('59 replaces matching enemies with a new one at the same position', () => {
    const { ctx, g } = mk();
    dat(g, 100);
    live(g, 3, { ex: 40, ey: 60, linknum: 8 });
    live(g, 4, { ex: 1, ey: 2, linknum: 9 });
    run(ctx, { eventtype: 59, eventdat: 100, eventdat4: 8 });
    // the old enemy is released first-to-last, the new one lands in the first free slot of the 25-window (slot 0)
    expect(g.enemies.enemyAvail[3]).toBe(1);
    expect(g.enemies.enemyAvail[4]).toBe(0);
    expect([g.enemies.enemy[0]!.ex, g.enemies.enemy[0]!.ey]).toEqual([40, 60]);
    expect(g.enemies.enemyAvail[0]).toBe(0);
  });
});

describe('eventSystem: global enemy edits', () => {
  it('19 moves enemies by linknum, honouring -99 and dat6', () => {
    const { ctx, g } = mk();
    live(g, 5, { linknum: 4 });
    live(g, 6, { linknum: 5 });
    run(ctx, { eventtype: 19, eventdat: -3, eventdat2: -99, eventdat3: 0, eventdat4: 4, eventdat5: 7, eventdat6: 2 });
    const e = g.enemies.enemy;
    expect([e[5]!.exc, e[5]!.eyc, e[5]!.fixedmovey, e[5]!.enemycycle]).toEqual([-3, 0, 2, 7]);
    expect([e[6]!.exc, e[6]!.fixedmovey]).toEqual([0, 0]);
  });
  it('19 dat6 == -99 sets fixedmovey to -99 then 0', () => {
    const { ctx, g } = mk();
    live(g, 5, { linknum: 4 });
    run(ctx, { eventtype: 19, eventdat: -99, eventdat2: -99, eventdat3: 0, eventdat4: 4, eventdat6: -99 });
    expect(g.enemies.enemy[5]!.fixedmovey).toBe(0);
  });
  it.each([[2, 0, 25], [1, 25, 50], [3, 50, 75]])('19 dat3=%i hits every enemy in [%i,%i)', (d3, lo, hi) => {
    const { ctx, g } = mk();
    run(ctx, { eventtype: 19, eventdat: 2, eventdat2: -99, eventdat3: d3 });
    for (let i = 0; i < 100; i++) expect(g.enemies.enemy[i]!.exc).toBe(i >= lo && i < hi ? 2 : 0);
  });
  it('19 dat3 80..89 takes the link from newPL', () => {
    const { ctx, g } = mk();
    g.events.newPL[2] = 11;
    live(g, 1, { linknum: 11 });
    live(g, 2, { linknum: 12 });
    const r = run(ctx, { eventtype: 19, eventdat: 5, eventdat2: -99, eventdat3: 82 });
    expect(r.eventdat4).toBe(11);
    expect([g.enemies.enemy[1]!.exc, g.enemies.enemy[2]!.exc]).toEqual([5, 0]);
  });
  it('20 sets acceleration state and animation (only for non-free enemies)', () => {
    const { ctx, g } = mk();
    live(g, 2, { linknum: 6 });
    g.enemies.enemy[3]!.linknum = 6; // avail 1: untouched
    run(ctx, { eventtype: 20, eventdat: -4, eventdat2: 3, eventdat4: 6, eventdat5: 9, eventdat6: 2 });
    const e = g.enemies.enemy[2]!;
    expect([e.excc, e.exccw, e.exccwmax, e.exccadd, e.eycc, e.eyccw, e.eyccwmax, e.eyccadd]).toEqual([-4, 4, 4, -1, 3, 3, 3, 1]);
    expect([e.enemycycle, e.ani, e.animin, e.animax, e.aniactive]).toEqual([9, 2, 9, 0, 1]);
    expect(g.enemies.enemy[3]!.excc).toBe(0);
    expect(g.scratch.temp).toBe(100);
  });
  it('24 animates linked enemies', () => {
    const { ctx, g } = mk();
    live(g, 2, { linknum: 6, ani: 5 });
    run(ctx, { eventtype: 24, eventdat: 8, eventdat2: 3, eventdat3: 2, eventdat4: 6 });
    const e = g.enemies.enemy[2]!;
    expect([e.aniactive, e.aniwhenfire, e.enemycycle, e.animin, e.ani, e.animax]).toEqual([2, 2, 3, 3, 8, 8]);
  });
  it('24 with dat2 <= 0 clears enemycycle; dat3 == 1 sets animax', () => {
    const { ctx, g } = mk();
    live(g, 2, { linknum: 6, ani: 5, enemycycle: 4 });
    run(ctx, { eventtype: 24, eventdat: 0, eventdat2: 0, eventdat3: 1, eventdat4: 6 });
    const e = g.enemies.enemy[2]!;
    expect([e.aniactive, e.enemycycle, e.animax]).toEqual([1, 0, 5]);
  });
  it('25 sets armor of all (dat4 == 0) or linked enemies', () => {
    const { ctx, g } = mk();
    g.enemies.enemy[1]!.linknum = 3;
    run(ctx, { eventtype: 25, eventdat: 40, eventdat4: 3 });
    expect([g.enemies.enemy[1]!.armorleft, g.enemies.enemy[2]!.armorleft]).toEqual([40, 0]);
    run(ctx, { eventtype: 25, eventdat: 41, eventdat4: 0 });
    expect(g.enemies.enemy[2]!.armorleft).toBe(41);
  });
  it('27 sets reversal and filter', () => {
    const { ctx, g } = mk();
    g.enemies.enemy[1]!.linknum = 3;
    run(ctx, { eventtype: 27, eventdat: -2, eventdat2: -99, eventdat3: 5, eventdat4: 3 });
    const e = g.enemies.enemy[1]!;
    expect([e.exrev, e.eyrev, e.filter]).toEqual([-2, 0, 5]);
    run(ctx, { eventtype: 27, eventdat: -99, eventdat2: 4, eventdat3: 20, eventdat4: 3 });
    expect([e.eyrev, e.filter]).toEqual([4, 5]); // filter only for dat3 < 17
  });
  it('31 overrides fire frequencies', () => {
    const { ctx, g } = mk();
    live(g, 1, { linknum: 7, launchtype: 3 });
    live(g, 2, { linknum: 7, launchtype: 0 });
    run(ctx, { eventtype: 31, eventdat: 1, eventdat2: 2, eventdat3: 3, eventdat4: 7, eventdat5: 9 });
    const a = g.enemies.enemy[1]!, b2 = g.enemies.enemy[2]!;
    expect(Array.from(a.freq)).toEqual([1, 2, 3]);
    expect(Array.from(a.eshotwait)).toEqual([1, 1, 1]);
    expect([a.launchfreq, a.launchwait, b2.launchfreq, b2.launchwait]).toEqual([9, 1, 0, 0]);
    expect(g.scratch.temp2).toBe(3);
    run(ctx, { eventtype: 31, eventdat: 5, eventdat2: 5, eventdat3: 5, eventdat4: 99 });
    expect(Array.from(g.enemies.enemy[60]!.freq)).toEqual([5, 5, 5]);
  });
  it('39 changes linknum, 47 sets armor, 55 acceleration, 58 launch type, 60 special, 74 bounce', () => {
    const { ctx, g } = mk();
    const e = g.enemies.enemy;
    e[1]!.linknum = 3;
    run(ctx, { eventtype: 39, eventdat: 3, eventdat2: 8 });
    expect(e[1]!.linknum).toBe(8);
    run(ctx, { eventtype: 47, eventdat: 12, eventdat4: 8 });
    expect(e[1]!.armorleft).toBe(12);
    run(ctx, { eventtype: 55, eventdat: -1, eventdat2: -99, eventdat4: 8 });
    expect([e[1]!.xaccel, e[1]!.yaccel]).toEqual([255, 0]); // JE_byte
    run(ctx, { eventtype: 58, eventdat: 1005, eventdat4: 8 });
    expect(e[1]!.launchtype).toBe(1005);
    run(ctx, { eventtype: 60, eventdat: 2, eventdat2: 1, eventdat4: 8 });
    expect([e[1]!.special, e[1]!.flagnum, e[1]!.setto]).toEqual([true, 2, true]);
    run(ctx, { eventtype: 74, eventdat: 100, eventdat2: -99, eventdat4: 8, eventdat5: -100, eventdat6: -99 });
    expect([e[1]!.xmaxbounce, e[1]!.ymaxbounce, e[1]!.xminbounce, e[1]!.yminbounce]).toEqual([100, 0, -100, 0]);
  });
  it('55 uses newPL for dat3 80..89', () => {
    const { ctx, g } = mk();
    g.events.newPL[0] = 5;
    g.enemies.enemy[1]!.linknum = 5;
    run(ctx, { eventtype: 55, eventdat: 3, eventdat2: 4, eventdat3: 80, eventdat4: 0 });
    expect([g.enemies.enemy[1]!.xaccel, g.enemies.enemy[1]!.yaccel]).toEqual([3, 4]);
    expect(g.enemies.enemy[2]!.xaccel).toBe(0);
  });
  it('33 sets enemydie of linked enemies (no RNG for ordinary dat)', () => {
    const { ctx, g } = mk();
    g.enemies.enemy[1]!.linknum = 3;
    run(ctx, { eventtype: 33, eventdat: 600, eventdat4: 3 });
    expect(g.enemies.enemy[1]!.enemydie).toBe(600);
    expect(ctx.rng.calls).toBe(0);
  });
  it('33 skips entirely for 512/513 in onePlayerAction', () => {
    const { ctx, g } = mk();
    g.config.onePlayerAction = true;
    g.enemies.enemy[1]!.linknum = 3;
    run(ctx, { eventtype: 33, eventdat: 512, eventdat4: 3 });
    expect(g.enemies.enemy[1]!.enemydie).toBe(0);
  });
  it('33 with dat 533 draws one RNG value for the lives compare when lives != 11', () => {
    const { ctx, g } = mk(5);
    g.players[0].items.weapon[0]!.power = 3; // lives aliases front-weapon power
    g.enemies.enemy[1]!.linknum = 3;
    const probe = new MersenneTwister(); probe.srand(5);
    const r1 = probe.rand(), r2 = probe.rand();
    run(ctx, { eventtype: 33, eventdat: 533, eventdat4: 3 });
    if (r1 % 15 < 3) {
      expect(ctx.rng.calls).toBe(2);
      expect(g.enemies.enemy[1]!.enemydie).toBe(829 + (r2 % 6));
    } else {
      expect(ctx.rng.calls).toBe(1);
      expect(g.enemies.enemy[1]!.enemydie).toBe(533);
    }
  });
  it('33 with lives == 11 short-circuits the compare, then draws once for the weapon', () => {
    const { ctx, g } = mk(5);
    g.players[0].items.weapon[0]!.power = 11;
    g.enemies.enemy[1]!.linknum = 3;
    const probe = new MersenneTwister(); probe.srand(5);
    const r1 = probe.rand();
    run(ctx, { eventtype: 33, eventdat: 533, eventdat4: 3 });
    expect(ctx.rng.calls).toBe(1);
    expect(g.enemies.enemy[1]!.enemydie).toBe(829 + (r1 % 6));
  });
  it('45 does the double draw but only assigns enemydie in action modes', () => {
    const { ctx, g } = mk(5);
    g.players[0].items.weapon[0]!.power = 11;
    g.enemies.enemy[1]!.linknum = 3;
    const r = run(ctx, { eventtype: 45, eventdat: 533, eventdat4: 3 });
    expect(ctx.rng.calls).toBe(1);
    expect(r.eventdat).toBeGreaterThanOrEqual(829);
    expect(g.enemies.enemy[1]!.enemydie).toBe(0);
    const t = mk(5);
    t.g.players[0].items.weapon[0]!.power = 11;
    t.g.config.onePlayerAction = true;
    t.g.enemies.enemy[1]!.linknum = 3;
    const r2 = run(t.ctx, { eventtype: 45, eventdat: 533, eventdat4: 3 });
    expect(t.g.enemies.enemy[1]!.enemydie).toBe(r2.eventdat);
  });
});

describe('eventSystem: flow control', () => {
  it('11 starts the level end, or really ends it', () => {
    let { ctx, g } = mk();
    run(ctx, { eventtype: 11 });
    expect([g.varz.endLevel, g.varz.levelEnd, g.varz.readyToEndLevel, g.varz.reallyEndLevel]).toEqual([true, 40, false, false]);
    ({ ctx, g } = mk());
    run(ctx, { eventtype: 11, eventdat: 1 });
    expect(g.varz.reallyEndLevel).toBe(true);
    ({ ctx, g } = mk());
    g.varz.allPlayersGone = true;
    run(ctx, { eventtype: 11 });
    expect(g.varz.reallyEndLevel).toBe(true);
    ({ ctx, g } = mk());
    g.varz.endLevel = true; g.varz.levelEnd = 3; g.varz.readyToEndLevel = true;
    run(ctx, { eventtype: 11 });
    expect([g.varz.levelEnd, g.varz.readyToEndLevel]).toEqual([3, true]);
  });
  it('16 draws a text window and queues the voice', () => {
    const { ctx, g } = mk();
    run(ctx, { eventtype: 16, eventdat: 1 });
    expect(g.varz.soundQueue[3]).toBe(V_DANGER);
    expect(drawTextWindow).toHaveBeenCalledWith(ctx, 'out0');
  });
  it('16 with eventdat > 9 only warns', () => {
    const { ctx, g } = mk();
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    run(ctx, { eventtype: 16, eventdat: 10 });
    expect(w).toHaveBeenCalled();
    expect(g.varz.soundQueue[3]).toBe(0);
    w.mockRestore();
  });
  it('34 fades music only when firstGameOver; 35 plays a song', () => {
    const { ctx, g, audio } = mk();
    g.config.tyrMusicVolume = 200; g.config.fxVolume = 100;
    run(ctx, { eventtype: 34 });
    expect(g.varz.musicFade).toBe(false);
    g.varz.firstGameOver = true;
    run(ctx, { eventtype: 34 });
    expect([g.varz.musicFade, g.config.tempVolume]).toEqual([true, 200]);
    run(ctx, { eventtype: 35, eventdat: 5 });
    expect(audio.playSong).toHaveBeenCalledWith(4);
    expect(audio.setVolume).toHaveBeenCalledWith(200, 100);
    expect(g.varz.musicFade).toBe(false);
    audio.playSong.mockClear();
    g.varz.firstGameOver = false; g.varz.musicFade = true;
    run(ctx, { eventtype: 35, eventdat: 5 });
    expect(audio.playSong).not.toHaveBeenCalled();
    expect(g.varz.musicFade).toBe(false);
  });
  it('46 adjusts and clamps difficulty, and sets damageRate', () => {
    const { ctx, g } = mk();
    g.config.difficultyLevel = 3;
    run(ctx, { eventtype: 46, eventdat: -1, eventdat2: 0, eventdat3: 4 });
    expect([g.config.difficultyLevel, g.varz.damageRate]).toEqual([2, 4]);
    run(ctx, { eventtype: 46, eventdat: -9, eventdat2: 0 });
    expect(g.config.difficultyLevel).toBe(1);
    run(ctx, { eventtype: 46, eventdat: 30, eventdat2: 0 });
    expect(g.config.difficultyLevel).toBe(10);
    run(ctx, { eventtype: 46, eventdat: -3, eventdat2: 1 }); // only in action modes
    expect(g.config.difficultyLevel).toBe(10);
    g.config.onePlayerAction = true;
    run(ctx, { eventtype: 46, eventdat: -3, eventdat2: 1 });
    expect(g.config.difficultyLevel).toBe(7);
  });
  it('61 skips events when the flag matches', () => {
    const { ctx, g } = mk();
    g.varz.globalFlags[2] = true;
    run(ctx, { eventtype: 61, eventdat: 3, eventdat2: 1, eventdat3: 4 });
    expect(g.events.eventLoc).toBe(1 + 4 + 1);
    run(ctx, { eventtype: 61, eventdat: 3, eventdat2: 0, eventdat3: 4 });
    expect(g.events.eventLoc).toBe(2);
  });
  it('63 / 80 / 66 skip counts', () => {
    let { ctx, g } = mk();
    run(ctx, { eventtype: 63, eventdat: 3 });
    expect(g.events.eventLoc).toBe(5);
    g.config.onePlayerAction = true;
    run(ctx, { eventtype: 63, eventdat: 3 });
    expect(g.events.eventLoc).toBe(2);
    ({ ctx, g } = mk());
    run(ctx, { eventtype: 80, eventdat: 3 });
    expect(g.events.eventLoc).toBe(2);
    g.config.twoPlayerMode = true;
    run(ctx, { eventtype: 80, eventdat: 3 });
    expect(g.events.eventLoc).toBe(5);
    ({ ctx, g } = mk());
    g.config.initialDifficulty = 2;
    run(ctx, { eventtype: 66, eventdat: 2, eventdat2: 6 });
    expect(g.events.eventLoc).toBe(8);
    run(ctx, { eventtype: 66, eventdat: 1, eventdat2: 6 });
    expect(g.events.eventLoc).toBe(2);
  });
  it('38 jumps to a time and picks the last event at or before it', () => {
    const { ctx, g } = mk();
    const ev = g.events;
    ev.maxEvent = 4;
    [0, 5, 10, 20].forEach((t, i) => { ev.eventRec[i]!.eventtime = t; ev.eventRec[i]!.eventtype = 99; });
    run(ctx, { eventtype: 38, eventdat: 12 });
    expect(ev.curLoc).toBe(12);
    expect(ev.eventLoc).toBe(3); // last record with time <= 12 is index 2 -> eventLoc = 2, then eventLoc++
  });
});

describe('eventJump and the sentinel', () => {
  function setup(times: number[], rec: Rec) {
    const m = mk();
    const ev = m.g.events;
    ev.maxEvent = times.length;
    times.forEach((t, i) => { Object.assign(ev.eventRec[i]!, new EventRec(), { eventtime: t, eventtype: 99 }); });
    Object.assign(ev.eventRec[times.length]!, new EventRec(), { eventtime: 65500 }); // sentinel
    Object.assign(ev.eventRec[0]!, rec);
    ev.eventLoc = 1;
    return m;
  }
  it('54 jumps: curLoc = target, returnLoc = curLoc + 1, eventLoc = first event at/after target (then ++)', () => {
    const { ctx, g } = setup([0, 10, 20, 30], { eventtype: 54, eventdat: 20 });
    g.events.curLoc = 15;
    eventSystem(ctx);
    expect([g.events.curLoc, g.events.returnLoc, g.events.eventLoc]).toEqual([20, 16, 3]);
  });
  it('54 with 65535 returns to returnLoc', () => {
    const { ctx, g } = setup([0, 10, 20, 30], { eventtype: 54, eventdat: -1 });
    g.events.curLoc = 99; g.events.returnLoc = 10;
    eventSystem(ctx);
    expect([g.events.curLoc, g.events.returnLoc, g.events.eventLoc]).toEqual([10, 10, 2]);
  });
  it('54 past the last event stops on the 65500 sentinel (eventLoc = maxEvent + 1)', () => {
    const { ctx, g } = setup([0, 10, 20, 30], { eventtype: 54, eventdat: 100 });
    eventSystem(ctx);
    expect(g.events.eventLoc).toBe(5);
  });
  it('70 jumps when no enemy has any linknum 1..19 (dat2 == 0), otherwise falls through', () => {
    const a = setup([0, 10, 20, 30], { eventtype: 70, eventdat: 20, eventdat2: 0 });
    eventSystem(a.ctx);
    expect(a.g.events.curLoc).toBe(20);
    const b = setup([0, 10, 20, 30], { eventtype: 70, eventdat: 20, eventdat2: 0 });
    live(b.g, 3, { linknum: 7 });
    eventSystem(b.ctx);
    expect([b.g.events.curLoc, b.g.events.eventLoc]).toEqual([0, 2]);
  });
  it('70 with explicit links jumps only when all given links are absent', () => {
    const a = setup([0, 10, 20, 30], { eventtype: 70, eventdat: 10, eventdat2: 5, eventdat3: 6, eventdat4: 0 });
    live(a.g, 3, { linknum: 6 });
    eventSystem(a.ctx);
    expect(a.g.events.curLoc).toBe(0);
    const b = setup([0, 10, 20, 30], { eventtype: 70, eventdat: 10, eventdat2: 5, eventdat3: 6, eventdat4: 8 });
    eventSystem(b.ctx);
    expect(b.g.events.curLoc).toBe(10);
  });
  it('71 jumps while mapYPos*2 <= dat2 (slot arithmetic); a negative slot never jumps', () => {
    const a = setup([0, 10, 20, 30], { eventtype: 71, eventdat: 20, eventdat2: 28 });
    a.g.backgrounds.mapYPos = 14;
    eventSystem(a.ctx);
    expect(a.g.events.curLoc).toBe(20);
    const b = setup([0, 10, 20, 30], { eventtype: 71, eventdat: 20, eventdat2: 27 });
    b.g.backgrounds.mapYPos = 14;
    eventSystem(b.ctx);
    expect(b.g.events.curLoc).toBe(0);
    const c = setup([0, 10, 20, 30], { eventtype: 71, eventdat: 20, eventdat2: 100 });
    c.g.backgrounds.mapYPos = -1;
    eventSystem(c.ctx);
    expect(c.g.events.curLoc).toBe(0);
  });
  it('75 with no matching enemy sets newPL to 255 and skips dat4 events', () => {
    const { ctx, g } = setup([0, 10, 20, 30], { eventtype: 75, eventdat: 1, eventdat2: 4, eventdat3: 81, eventdat4: 2 });
    g.events.eventRec[2]!.eventtime = 25;
    eventSystem(ctx);
    expect(g.events.newPL[1]).toBe(255);
    expect(g.events.curLoc).toBe(24); // eventRec[eventLoc-1+dat4].eventtime - 1
    expect(g.events.eventLoc).toBe(1 + 2 - 1 + 1);
    expect(ctx.rng.calls).toBe(0);
  });
  it('75 with a matching enemy draws until it finds a settled enemy with a linknum in range', () => {
    const { ctx, g } = setup([0, 10, 20, 30], { eventtype: 75, eventdat: 3, eventdat2: 5, eventdat3: 80, eventdat4: 0 });
    live(g, 9, { linknum: 4, eyc: 0 });
    const probe = new MersenneTwister(); probe.srand(7);
    let expected = -1, n = 0;
    for (;;) { n++; const t = (probe.rand() % 3) + 3; if (t === 4) { expected = t; break; } }
    eventSystem(ctx);
    expect(g.events.newPL[0]).toBe(expected);
    expect(ctx.rng.calls).toBe(n);
  });
  it('77 / 81 set map pointers as slot indexes', () => {
    const a = setup([0, 10], { eventtype: 77, eventdat: 29, eventdat2: 0 });
    eventSystem(a.ctx);
    expect([a.g.backgrounds.mapYPos, a.g.backgrounds.mapY2Pos]).toEqual([14, 14]);
    const b = setup([0, 10], { eventtype: 77, eventdat: 28, eventdat2: 40 });
    eventSystem(b.ctx);
    expect([b.g.backgrounds.mapYPos, b.g.backgrounds.mapY2Pos]).toEqual([14, 20]);
    const c = setup([0, 10], { eventtype: 81, eventdat: 60, eventdat2: 21 });
    eventSystem(c.ctx);
    expect([c.g.map.BKwrap2, c.g.map.BKwrap2to]).toEqual([30, 10]);
  });
  it('unknown event types warn and advance; unported ones throw', () => {
    const { ctx, g } = mk();
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    run(ctx, { eventtype: 200 });
    expect(w).toHaveBeenCalled();
    expect(g.events.eventLoc).toBe(2);
    w.mockRestore();
    expect(() => run(ctx, { eventtype: 64, eventdat: 1 })).toThrow('unported: event 64');
  });
});
