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

// ---------------------------------------------------------------------------------------------
// Task 8: level-loop HUD slots
// ---------------------------------------------------------------------------------------------
import { drawBossBar, drawLevelTopBars, drawTimers, drawWarnings, inGameDisplays, barX } from '../../src/game/hud';
import { S_WARNING } from '../../src/audio/ids';

const mkLoc = () => ({ oldWeaponBar: [0, 0] as [number, number] });

describeData('drawLevelTopBars', () => {
  it('weapon-power pips: clears the 22x3 strip then draws 2-px cells coloured 115+j; only redrawn on change', () => {
    const ctx = testCtx()!;
    const s = ctx.vga.screen;
    const loc = mkLoc();
    ctx.game.players[0].items.weapon[0]!.power = 3;
    ctx.game.players[0].items.weapon[1]!.power = 0;
    ctx.game.config.onePlayerAction = true;
    drawLevelTopBars(ctx, loc);
    expect(loc.oldWeaponBar).toEqual([3, 0]);
    // rectangle(x, y, x+1, y+2) outlines a 2x3 box, so both columns are coloured
    expect(rowColor(s, 289, 17)).toBe(116);
    expect(rowColor(s, 290, 19)).toBe(116);
    expect(rowColor(s, 291, 17)).toBe(117);
    expect(rowColor(s, 294, 17)).toBe(118);
    expect(rowColor(s, 295, 18)).toBe(0);
    s.pixels[17 * 320 + 289] = 99; // unchanged power => no redraw
    drawLevelTopBars(ctx, loc);
    expect(rowColor(s, 289, 17)).toBe(99);
  });

  it('power bar: onePlayerAction pins power at 900 and draws nothing', () => {
    const ctx = testCtx()!;
    ctx.game.config.onePlayerAction = true;
    drawLevelTopBars(ctx, mkLoc());
    expect(ctx.game.config.power).toBe(900);
    expect(rowColor(ctx.vga.screen, 270, 100)).toBe(0);
  });

  it('power bar: power += powerAdd (cap 900), fills the delta rows with colour 113 + temp/7, clobbers temp', () => {
    const ctx = testCtx()!;
    const c = ctx.game.config;
    const s = ctx.vga.screen;
    c.power = 700; c.powerAdd = 150; c.lastPower = 70;
    drawLevelTopBars(ctx, mkLoc());
    expect(c.power).toBe(850);
    expect(c.lastPower).toBe(85);
    expect(ctx.game.scratch.temp).toBe(85);
    // rows 113-11-85=17 .. 114-11-70=33, colour 113 + 85/7 = 125
    expect(rowColor(s, 269, 17)).toBe(125);
    expect(rowColor(s, 276, 33)).toBe(125);
    expect(rowColor(s, 269, 34)).toBe(0);
    c.powerAdd = 1000; // clamp
    drawLevelTopBars(ctx, mkLoc());
    expect(c.power).toBe(900);
    c.power = 100; c.powerAdd = 0; // shrink: clear the rows between
    drawLevelTopBars(ctx, mkLoc());
    expect(rowColor(s, 270, 17)).toBe(0);
    expect(rowColor(s, 270, 60)).toBe(0);
  });

  it('shield regen: costs shieldT power every 15th frame and raises both shields', () => {
    const ctx = testCtx()!;
    const c = ctx.game.config;
    const [p0, p1] = ctx.game.players;
    c.onePlayerAction = true;
    p0.isAlive = true; p0.shield = 5; p0.shieldMax = 10; p1.shield = 2;
    c.power = 900; c.shieldT = 4; c.shieldWait = 2;
    drawLevelTopBars(ctx, mkLoc());
    expect(p0.shield).toBe(5); expect(c.shieldWait).toBe(1);
    drawLevelTopBars(ctx, mkLoc());
    expect(p0.shield).toBe(6); expect(p1.shield).toBe(3); expect(c.shieldWait).toBe(15);
    expect(rowColor(ctx.vga.screen, 270, 194)).toBe(146);
  });

  it('textErase counts down and repaints the message area on reaching 0', () => {
    const ctx = testCtx()!;
    ctx.game.config.onePlayerAction = true;
    ctx.game.varz.textErase = 1;
    const exp = createSurface();
    blitSprite(exp, 16, 189, ctx.assets.shapes.tables[OPTION_SHAPES]!, 36);
    drawLevelTopBars(ctx, mkLoc());
    expect(ctx.game.varz.textErase).toBe(0);
    for (let x = 16; x < 40; x++) expect(rowColor(ctx.vga.screen, x, 190)).toBe(exp.pixels[190 * 320 + x]);
  });
});

describeData('drawWarnings', () => {
  it('draws nothing while armor >= 6', () => {
    const ctx = testCtx()!;
    ctx.game.players[0].isAlive = true; ctx.game.players[0].armor = 6;
    drawWarnings(ctx);
    expect(ctx.vga.gameScreen.pixels.every((p) => p === 0)).toBe(true);
  });

  it('low armor with the warning ship on cooldown: sound, flashing bars on game_screen, delay bookkeeping', () => {
    const ctx = testCtx()!;
    const v = ctx.game.varz;
    const p = ctx.game.players[0];
    p.isAlive = true; p.armor = 2;
    v.armorShipDelay = 10; v.warningSoundDelay = 100; v.warningCol = 113; v.warningColChange = 1;
    drawWarnings(ctx);
    expect(v.armorShipDelay).toBe(9);
    expect(ctx.game.scratch.tempW).toBe(16); // armor*4+8
    expect(v.warningSoundDelay).toBe(15); // clamped to 16 then decremented
    expect(v.warningCol).toBe(114);
    const gs = ctx.vga.gameScreen;
    expect(rowColor(gs, 24, 181)).toBe(114);
    expect(rowColor(gs, 287, 3)).toBe(114);
    expect(rowColor(gs, 100, 182)).toBe(114);
    expect(rowColor(ctx.vga.screen, 24, 181)).toBe(0); // not the visible screen
    // WARNING text drawn between the bars
    let lit = 0;
    for (let y = 178; y < 186; y++) for (let x = 140; x < 175; x++) if (gs.pixels[y * 320 + x] !== 0 && gs.pixels[y * 320 + x] !== 114) lit++;
    expect(lit).toBeGreaterThan(10);
    // sound fires when the delay reaches 1
    v.warningSoundDelay = 1;
    drawWarnings(ctx);
    expect(v.soundQueue[7]).toBe(S_WARNING);
    expect(v.warningSoundDelay).toBe(16);
  });

  it('colour ping-pong: bounces at 113 + (14 - 2*armor) and at 113', () => {
    const ctx = testCtx()!;
    const v = ctx.game.varz;
    ctx.game.players[0].isAlive = true; ctx.game.players[0].armor = 4;
    v.armorShipDelay = 99; v.warningSoundDelay = 99;
    v.warningCol = 119; v.warningColChange = 1; // top is 113 + 6 = 119
    drawWarnings(ctx);
    expect(v.warningCol).toBe(119); expect(v.warningColChange).toBe(-1);
    v.warningCol = 113; v.warningColChange = -1;
    drawWarnings(ctx); // 112 < 113 => reverse, no clamp
    expect(v.warningCol).toBe(112); expect(v.warningColChange).toBe(1);
  });
});

describeData('drawTimers', () => {
  it('displayTime flashes the text on game_screen and ping-pongs flash', () => {
    const ctx = testCtx()!;
    const v = ctx.game.varz;
    v.displayTime = 2; v.flash = 4; v.flashChange = 1;
    drawTimers(ctx);
    expect(v.displayTime).toBe(1); expect(v.flash).toBe(5); expect(v.flashChange).toBe(-1);
    expect(ctx.vga.gameScreen.pixels.some((p) => p !== 0)).toBe(true);
    expect(ctx.vga.screen.pixels.every((p) => p === 0)).toBe(true);
  });

  it('pentiumMode toggles frameCountMax 2 <-> 3', () => {
    const ctx = testCtx()!;
    ctx.game.config.pentiumMode = true; ctx.game.config.frameCountMax = 2;
    drawTimers(ctx);
    expect(ctx.game.config.frameCountMax).toBe(3);
    drawTimers(ctx);
    expect(ctx.game.config.frameCountMax).toBe(2);
  });

  it('level timer: sound schedule and text', () => {
    const ctx = testCtx()!;
    const v = ctx.game.varz;
    v.levelTimer = true; v.levelTimerCountdown = 301; v.levelTimerJumpTo = 0;
    drawTimers(ctx);
    expect(v.levelTimerCountdown).toBe(300);
    expect(v.soundQueue[7]).toBe(S_WARNING);
    expect(v.soundQueue[6]).toBe(24); // S_CLICK
    expect(ctx.vga.gameScreen.pixels.some((p) => p !== 0)).toBe(true);
  });

  it('GAME OVER: demo + all players gone and no explosion => reallyEndLevel; exploding => musicFade only', () => {
    const ctx = testCtx()!;
    const v = ctx.game.varz;
    ctx.state.playDemo = true;
    v.allPlayersGone = true;
    ctx.game.players[0].explodingTicks = 3;
    drawTimers(ctx);
    expect(v.musicFade).toBe(true); expect(v.reallyEndLevel).toBe(false);
    ctx.game.players[0].explodingTicks = 0;
    v.firstGameOver = true;
    drawTimers(ctx);
    expect(v.reallyEndLevel).toBe(true);
    expect(v.firstGameOver).toBe(false);
  });

  it('GAME OVER outside a demo draws the banner instead', () => {
    const ctx = testCtx()!;
    ctx.state.playDemo = false;
    ctx.game.varz.allPlayersGone = true;
    ctx.game.varz.firstGameOver = true;
    drawTimers(ctx);
    expect(ctx.vga.gameScreen.pixels.some((p) => p !== 0)).toBe(true);
    expect(ctx.game.varz.reallyEndLevel).toBe(false); // waits for a key (input-level.test.ts covers the wait itself)
    ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 });
    drawTimers(ctx);
    expect(ctx.game.varz.reallyEndLevel).toBe(true);
  });
});

describeData('boss bar', () => {
  it('barX paints three bands col+1 / col / col-1', () => {
    const ctx = testCtx()!;
    barX(ctx, 10, 20, 30, 25, 115);
    const gs = ctx.vga.gameScreen;
    expect(rowColor(gs, 10, 20)).toBe(116);
    expect(rowColor(gs, 10, 21)).toBe(115);
    expect(rowColor(gs, 30, 24)).toBe(115);
    expect(rowColor(gs, 30, 25)).toBe(114);
  });

  it('tracks the most damaged linked enemy; one bar sits at x=155 (250 with a level timer); dead boss clears', () => {
    const ctx = testCtx()!;
    const e = ctx.game.enemies;
    e.enemyAvail.fill(1);
    e.enemyAvail[3] = 0; e.enemy[3]!.linknum = 7; e.enemy[3]!.armorleft = 100;
    e.enemyAvail[4] = 0; e.enemy[4]!.linknum = 7; e.enemy[4]!.armorleft = 40;
    e.bossBar[1]!.linkNum = 7; e.bossBar[1]!.color = 2; // only the second slot: moves to the first
    drawBossBar(ctx);
    expect(e.bossBar[0]!.linkNum).toBe(7);
    expect(e.bossBar[1]!.linkNum).toBe(0);
    expect(e.bossBar[0]!.armor).toBe(40);
    expect(e.bossBar[0]!.color).toBe(1);
    const gs = ctx.vga.gameScreen;
    expect(rowColor(gs, 130, 7)).toBe(116); // frame x-25 .. x+25
    expect(rowColor(gs, 155 - 4, 9)).toBe(118 + 2); // fill: x - 40/10 .. x + 45/10
    expect(rowColor(gs, 155 + 4, 9)).toBe(118 + 2);
    expect(rowColor(gs, 155 + 5, 9)).toBe(115);
    e.enemy[3]!.armorleft = 0; e.enemy[4]!.armorleft = 0;
    drawBossBar(ctx);
    expect(e.bossBar[0]!.linkNum).toBe(0);
  });

  it('armor 255 is shown as 254; two bars at x=125/185; level timer lowers them', () => {
    const ctx = testCtx()!;
    const e = ctx.game.enemies;
    e.enemyAvail.fill(1);
    e.enemyAvail[0] = 0; e.enemy[0]!.linknum = 1; e.enemy[0]!.armorleft = 255;
    e.enemyAvail[1] = 0; e.enemy[1]!.linknum = 2; e.enemy[1]!.armorleft = 10;
    e.bossBar[0]!.linkNum = 1; e.bossBar[1]!.linkNum = 2;
    ctx.game.varz.levelTimer = true;
    drawBossBar(ctx);
    expect(e.bossBar[0]!.armor).toBe(254);
    expect(rowColor(ctx.vga.gameScreen, 100, 15)).toBe(119); // armor 254 fills the whole frame: top band 118+1
    expect(rowColor(ctx.vga.gameScreen, 210, 15)).toBe(116); // x=185+25
  });
});

describeData('inGameDisplays', () => {
  it('draws cash on game_screen, bombs at (30 + 12k, 160), and clobbers tempW in the lives loop', () => {
    const ctx = testCtx()!;
    const g = ctx.game;
    g.players[0].cash = 12345; g.players[0].superbombs = 2;
    g.config.onePlayerAction = true;
    g.players[0].lives = 4; // 3 extra lives
    inGameDisplays(ctx);
    const gs = ctx.vga.gameScreen;
    let cash = 0;
    for (let y = 173; y < 183; y++) for (let x = 28; x < 70; x++) if (gs.pixels[y * 320 + x]) cash++;
    expect(cash).toBeGreaterThan(20);
    let bombs = 0;
    for (let y = 160; y < 180; y++) for (let x = 30; x < 60; x++) if (gs.pixels[y * 320 + x]) bombs++;
    expect(bombs).toBeGreaterThan(100);
    expect(g.scratch.tempW).toBe(28); // last assignment: label x for player 0
    expect(ctx.vga.screen.pixels.every((p) => p === 0)).toBe(true);
  });
});
