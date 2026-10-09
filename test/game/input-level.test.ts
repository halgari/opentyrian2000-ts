import { describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/ctx';
import { loadItemDatIntoWorld } from '../../src/game/episodes';
import { gameOverKeyWait, gammaCheck, levelInputTail, mainKeyboardInput, pauseGame } from '../../src/game/input-level';
import { mainGamePlayerFunctions } from '../../src/game/player';
import { getShipInfo } from '../../src/game/shots';
import { defaultKeySettings, defaultMouseSettings } from '../../src/game/world';
import { attachDomInput } from '../../src/platform/dom-input';
import { Scancode } from '../../src/platform/scancodes';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

// SDL scancodes
const SC = { Space: 44, Return: 40, LCtrl: 224, LAlt: 226, P: 19, F2: 59, F3: 60, F4: 61, F6: 63, F7: 64, F9: 66, F11: 68, Backslash: 49, Slash: 56 };

function setup() {
  const ctx = testCtx()!;
  const g = ctx.game;
  ctx.state.playDemo = false;
  g.config.keySettings.set(defaultKeySettings);
  g.config.mouseSettings.set(defaultMouseSettings);
  loadItemDatIntoWorld(ctx);
  g.players[0].items.ship = 1;
  g.players[0].items.weapon[0].id = 0;
  g.players[0].items.weapon[1].id = 0;
  getShipInfo(ctx);
  g.players[0].isAlive = true;
  g.players[0].x = 100; g.players[0].y = 100;
  g.config.shotRepeat.fill(0);
  return { ctx, g, p: g.players[0], v: g.varz };
}

const down = (ctx: Ctx, sc: number): void => ctx.input.push({ type: 'keydown', scancode: sc, mod: 0 });
const up = (ctx: Ctx, sc: number): void => ctx.input.push({ type: 'keyup', scancode: sc });
const motion = (ctx: Ctx, dx: number, dy: number): void =>
  ctx.input.push({ type: 'mousemove', x: 0, y: 0, moved: dx !== 0 || dy !== 0, dx, dy });

/** Runs `fn` after the n-th clock sleep of the code under test (events arrive while it waits). */
function onSleep(ctx: Ctx, fn: (n: number) => void): { sleeps: () => number } {
  let n = 0;
  const orig = ctx.clock.sleep.bind(ctx.clock);
  ctx.clock.sleep = async (ms: number) => { await orig(ms); fn(++n); };
  return { sleeps: () => n };
}

describeData('JE_playerMovement keyboard input (mainint.c:3728-3790)', () => {
  it('Right held for 10 frames then released: same velocity/position series as the demo path (hand-computed)', () => {
    const { ctx, p } = setup();
    const vel = [1, 2, 2, 3, 3, 4, 4, 4, 4, 4, 3, 3, 2, 2, 1, 1, 0];
    const xs = [102, 105, 108, 112, 116, 121, 126, 131, 136, 141, 144, 147, 149, 151, 152, 153, 153];
    down(ctx, Scancode.Right);
    for (let i = 0; i < vel.length; i++) {
      if (i === 10) up(ctx, Scancode.Right);
      mainGamePlayerFunctions(ctx);
      expect([p.xVelocity, p.x, p.y], `frame ${i + 1}`).toEqual([vel[i], xs[i], 100]);
    }
  });

  it('Up/Down/Left stack on x and y (+-1 per frame each, opposite keys cancel)', () => {
    const { ctx, p } = setup();
    down(ctx, Scancode.Up); down(ctx, Scancode.Left);
    mainGamePlayerFunctions(ctx);
    // x: -1, accel -1 -> vel -1 -> 98 ; y likewise
    expect([p.x, p.y, p.xVelocity, p.yVelocity]).toEqual([98, 98, -1, -1]);
    const c = setup();
    down(c.ctx, Scancode.Left); down(c.ctx, Scancode.Right);
    mainGamePlayerFunctions(c.ctx);
    expect(c.p.x).toBe(100);
  });

  it('fire, change-fire, left and right sidekick keys fill button[0], [3], [1], [2] (note the order)', () => {
    const cases: [number, boolean[]][] = [
      [SC.Space, [true, false, false, false]],
      [SC.Return, [false, false, false, true]],
      [SC.LCtrl, [false, true, false, false]],
      [SC.LAlt, [false, false, true, false]],
    ];
    for (const [key, want] of cases) {
      const { ctx, v } = setup();
      down(ctx, key);
      mainGamePlayerFunctions(ctx);
      expect(v.button, `key ${key}`).toEqual(want);
    }
  });

  it('button[] is cleared at the start of every frame', () => {
    const { ctx, v } = setup();
    down(ctx, SC.Space);
    mainGamePlayerFunctions(ctx);
    expect(v.button[0]).toBe(true);
    up(ctx, SC.Space);
    mainGamePlayerFunctions(ctx);
    expect(v.button[0]).toBe(false);
  });

  it('honours remapped keySettings', () => {
    const { ctx, p } = setup();
    ctx.game.config.keySettings[3] = 4; // RIGHT = A
    down(ctx, 4);
    mainGamePlayerFunctions(ctx);
    expect(p.x).toBe(102);
  });
});

describeData('JE_playerMovement mouse input (mainint.c:3713-3726, 3792-3851)', () => {
  it('relative motion: mouse delta (m+3)/4 shift plus an accel kick when m > 3 (hand-computed)', () => {
    const { ctx, p } = setup();
    ctx.input.mouseSetRelative(true);
    motion(ctx, 12, 0); // scaled 320x200: (25*320)/640 = 12
    mainGamePlayerFunctions(ctx);
    // x += (12+3)/4 = 3 -> 103 ; accelXC = 0 + 1 (mouseXC > 3) -> velocity 1 -> 104
    expect([p.x, p.xVelocity]).toEqual([104, 1]);
  });
  it('negative motion truncates toward zero: -12 scales to -11, shifts -3, accel -1', () => {
    const { ctx, p } = setup();
    ctx.input.mouseSetRelative(true);
    motion(ctx, -12, 0); // (2*-12+1)*320/640 = -11.5 -> -11
    mainGamePlayerFunctions(ctx);
    // x += (-11-3)/4 = -3 (C division) -> 97 ; mouseXC < -2 -> accel -1 -> velocity -1 -> 96
    expect([p.x, p.xVelocity]).toEqual([96, -1]);
  });
  it('y has its own thresholds (> 2 / < -2): dy 2 moves one pixel with no accel kick, dy 3 kicks', () => {
    const a = setup();
    a.ctx.input.mouseSetRelative(true);
    motion(a.ctx, 0, 2); // scaled 2 -> y += (2+3)/4 = 1 ; no kick
    mainGamePlayerFunctions(a.ctx);
    expect([a.p.y, a.p.yVelocity]).toEqual([101, 0]);
    const b = setup();
    b.ctx.input.mouseSetRelative(true);
    motion(b.ctx, 0, 3); // 3 -> y += 6/4 = 1 ; kick -> velocity 1 -> 102
    mainGamePlayerFunctions(b.ctx);
    expect([b.p.y, b.p.yVelocity]).toEqual([102, 1]);
  });
  it('clamps the delta to +-30', () => {
    const { ctx, p } = setup();
    ctx.input.mouseSetRelative(true);
    motion(ctx, 200, 0);
    mainGamePlayerFunctions(ctx);
    // 30 -> x += 33/4 = 8 ; kick -> vel 1 -> 109
    expect(p.x).toBe(109);
  });
  it('mouse motion and keyboard stack', () => {
    const { ctx, p } = setup();
    ctx.input.mouseSetRelative(true);
    down(ctx, Scancode.Right);
    motion(ctx, 12, 0);
    mainGamePlayerFunctions(ctx);
    // key: x 101, accel 1 ; mouse: x += 3 -> 104, accel 2 -> velocity 2 -> 106
    expect([p.x, p.xVelocity]).toEqual([106, 2]);
  });
  it('motion arriving while not in relative mode is ignored', () => {
    const { ctx, p } = setup();
    motion(ctx, 12, 0);
    mainGamePlayerFunctions(ctx);
    expect(p.x).toBe(100);
  });
  it('mouse buttons: left fires, right = both sidekicks, middle = change rear mode', () => {
    const { ctx, v } = setup();
    const press = (button: number, d = true): void => ctx.input.push(d ? { type: 'mousedown', button, x: 0, y: 0 } : { type: 'mouseup', button, x: 0, y: 0 });
    press(1);
    mainGamePlayerFunctions(ctx);
    expect(v.button).toEqual([true, false, false, false]);
    press(1, false); press(3);
    mainGamePlayerFunctions(ctx);
    expect(v.button).toEqual([false, true, true, false]);
    press(3, false); press(2);
    mainGamePlayerFunctions(ctx);
    expect(v.button).toEqual([false, false, false, true]);
  });
  it('the smoothie-9 vertical flip also negates the mouse delta', () => {
    const { ctx, p } = setup();
    ctx.game.config.smoothies[8] = true;
    ctx.input.mouseSetRelative(true);
    motion(ctx, 0, 3);
    mainGamePlayerFunctions(ctx);
    // mouseYC = -3: y += (-3-3)/4 = -1 -> 99 ; mouseYC < -2 -> accel -1 -> velocity -1 -> 98
    expect([p.y, p.yVelocity]).toEqual([98, -1]);
  });
});

describeData('game-over wait (tyrian2.c:2185)', () => {
  it('any key ends the level', () => {
    const { ctx, v } = setup();
    gameOverKeyWait(ctx);
    expect(v.reallyEndLevel).toBe(false);
    down(ctx, SC.Space);
    gameOverKeyWait(ctx);
    expect(v.reallyEndLevel).toBe(true);
  });
  it('a mouse click ends the level', () => {
    const { ctx, v } = setup();
    ctx.input.push({ type: 'mousedown', button: 1, x: 1, y: 1 });
    gameOverKeyWait(ctx);
    expect(v.reallyEndLevel).toBe(true);
  });
  it('stale button[] quirk: a fire button left set by the dying frame ends the level at once', () => {
    const { ctx, v, p } = setup();
    down(ctx, SC.Space);
    mainGamePlayerFunctions(ctx); // alive frame with fire held: button[0] = true
    expect(v.button[0]).toBe(true);
    p.isAlive = false;
    p.explodingTicks = 0;
    mainGamePlayerFunctions(ctx); // dead: returns before button[] is reset
    expect(v.button[0]).toBe(true);
    ctx.input.serviceEvents(true); // (the key event was consumed already; no new key)
    expect(ctx.input.newkey).toBe(false);
    gameOverKeyWait(ctx);
    expect(v.reallyEndLevel).toBe(true);
  });
  it('button[3] (change fire) alone does not end it', () => {
    const { ctx, v } = setup();
    v.button[3] = true;
    gameOverKeyWait(ctx);
    expect(v.reallyEndLevel).toBe(false);
  });
});

describeData('mainKeyboardInput (mainint.c:3147)', () => {
  it('F11 cycles gamma 0..3, consumes the key and re-applies the palette', async () => {
    const { ctx } = setup();
    const ks = ctx.input.keysactive;
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      ks[SC.F11] = 1;
      ctx.input.newkey = true;
      expect(gammaCheck(ctx)).toBe(true);
      expect([ks[SC.F11], ctx.input.newkey]).toEqual([0, false]);
      seen.push(ctx.game.config.gammaCorrection);
    }
    expect(seen).toEqual([1, 2, 3, 0, 1]);
  });
  it('F11 gamma applies JE_gammaCorrect to the level-screen palette', async () => {
    const { ctx } = setup();
    ctx.input.keysactive[SC.F11] = 1;
    await mainKeyboardInput(ctx);
    expect(ctx.game.config.gammaCorrection).toBe(1);
    const cur = ctx.palette.current;
    expect(cur.some((x) => x > 0)).toBe(true);
    for (let i = 0; i < 768; i++) expect(cur[i]).toBe(ctx.palette.colors[i]);
  });
  it('P and Esc latch the pause / menu requests', async () => {
    const { ctx, v } = setup();
    ctx.input.keysactive[SC.P] = 1;
    await mainKeyboardInput(ctx);
    expect([v.pauseGamePressed, v.ingamemenuPressed]).toEqual([true, false]);
    ctx.input.keysactive[Scancode.Escape] = 1;
    await mainKeyboardInput(ctx);
    expect(v.ingamemenuPressed).toBe(true);
  });
  it('F2+F6+F7 skips the level; F9 vetoes it', async () => {
    const { ctx, v } = setup();
    const ks = ctx.input.keysactive;
    ks[SC.F2] = 1; ks[SC.F6] = 1; ks[SC.F7] = 1; ks[SC.F9] = 1;
    await mainKeyboardInput(ctx);
    expect(v.endLevel).toBe(false);
    ks[SC.F9] = 0;
    await mainKeyboardInput(ctx);
    expect([v.levelTimer, v.levelTimerCountdown, v.endLevel, v.levelEnd]).toEqual([true, 0, true, 40]);
  });
  it('F2+F3+F6 toggles cheating and releases F2', async () => {
    const { ctx, g } = setup();
    const ks = ctx.input.keysactive;
    ks[SC.F2] = 1; ks[SC.F3] = 1; ks[SC.F6] = 1;
    await mainKeyboardInput(ctx);
    expect([g.config.youAreCheating, ks[SC.F2]]).toEqual([true, 0]);
  });
  it('F2+F3+F4 zeroes the armour of both players and toggles cheating', async () => {
    const { ctx, g } = setup();
    g.players[0].armor = 10; g.players[1].armor = 7;
    const ks = ctx.input.keysactive;
    ks[SC.F2] = 1; ks[SC.F3] = 1; ks[SC.F4] = 1;
    await mainKeyboardInput(ctx);
    expect([g.players[0].armor, g.players[1].armor, g.config.youAreCheating]).toEqual([0, 0, true]);
  });
  it('the Nort ship code (F2 F4 F6 F7 F9 \\ /) swaps the ship', async () => {
    const { ctx, g, v } = setup();
    const ks = ctx.input.keysactive;
    for (const k of [SC.F2, SC.F4, SC.F6, SC.F7, SC.F9, SC.Backslash, SC.Slash]) ks[k] = 1;
    await mainKeyboardInput(ctx);
    const it = g.players[0].items;
    expect([it.ship, it.special, it.weapon[0].id, it.weapon[1].id, v.shipGr]).toEqual([12, 13, 36, 37, 1]);
  });
  it('Backspace + 1 cycles fastPlay 0,1,2,0 and releases the 1 key', async () => {
    const { ctx, g } = setup();
    const ks = ctx.input.keysactive;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      ks[Scancode.Backspace] = 1; ks[30] = 1;
      await mainKeyboardInput(ctx);
      seen.push(g.config.fastPlay);
      expect(ks[30]).toBe(0);
    }
    expect(seen).toEqual([1, 2, 0, 1]);
  });
  it('Backspace + minus cycles the filter colour -99, 0..15 and back', async () => {
    const { ctx, g } = setup();
    const ks = ctx.input.keysactive;
    g.config.levelFilter = -99;
    ks[Scancode.Backspace] = 1; ks[45] = 1;
    await mainKeyboardInput(ctx);
    expect(g.config.levelFilter).toBe(0);
    g.config.levelFilter = 15;
    await mainKeyboardInput(ctx);
    expect(g.config.levelFilter).toBe(-99);
  });
});

describeData('pauseGame (mainint.c:3391)', () => {
  it('shows "Paused", halves the music volume, waits for a key, restores volume and re-locks the mouse', async () => {
    const { ctx, g } = setup();
    g.config.tyrMusicVolume = 200; g.config.fxVolume = 100;
    const vols: [number, number][] = [];
    ctx.audio.setVolume = (m: number, f: number) => { vols.push([m, f]); };
    const rel: boolean[] = [];
    ctx.input.onRelativeMode = (e) => rel.push(e);
    ctx.input.mouseSetRelative(true);
    rel.length = 0;
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    onSleep(ctx, (n) => { if (n === 3) down(ctx, SC.Space); });
    await pauseGame(ctx);
    expect(frames).toBe(1);
    expect(vols).toEqual([[100, 100], [200, 100]]);
    expect(rel).toEqual([false, true]);
    expect(ctx.vga.screen.pixels.some((x) => x !== 0)).toBe(true);
  });
  it('Ctrl and Alt alone do not resume; a mouse button does', async () => {
    const { ctx } = setup();
    const s = onSleep(ctx, (n) => {
      if (n === 2) down(ctx, SC.LCtrl);
      if (n === 4) down(ctx, SC.LAlt);
      if (n === 6) ctx.input.push({ type: 'mousedown', button: 1, x: 5, y: 5 });
    });
    await pauseGame(ctx);
    expect(s.sleeps()).toBeGreaterThanOrEqual(6);
    expect(s.sleeps()).toBeLessThanOrEqual(8);
  });
  it('superPause skips the "Paused" frame', async () => {
    const { ctx, g } = setup();
    g.config.superPause = true;
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    onSleep(ctx, (n) => { if (n === 1) down(ctx, SC.Space); });
    await pauseGame(ctx);
    expect(frames).toBe(0);
  });
});

describeData('level input tail (tyrian2.c:2213-2260)', () => {
  it('no input: continues without pausing or opening the menu', async () => {
    const { ctx } = setup();
    expect(await levelInputTail(ctx)).toBe('continue');
  });
  it('P pauses once and the request is cleared', async () => {
    const { ctx, v } = setup();
    down(ctx, SC.P);
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    onSleep(ctx, (n) => { if (n === 2) down(ctx, SC.Space); });
    expect(await levelInputTail(ctx)).toBe('continue');
    expect([frames, v.pauseGamePressed]).toEqual([1, false]);
  });
  it('F1 shows the help and asks for the frame to restart (goto level_loop)', async () => {
    const { ctx, v } = setup();
    down(ctx, Scancode.F1);
    let frames = 0;
    ctx.frameSink = () => { frames++; if (frames === 2) down(ctx, SC.Space); };
    expect(await levelInputTail(ctx)).toBe('restart');
    expect(v.skipStarShowVGA).toBe(true);
    expect(frames).toBe(2);
    expect(ctx.input.newkey).toBe(false);
  });
  it('Esc opens the in-game menu with the mouse released, then skips presenting the frame', async () => {
    const { ctx, v } = setup();
    Object.assign(ctx.game.config, { tyrMusicVolume: 191, fxVolume: 191, processorType: 2, gameSpeed: 4 });
    down(ctx, Scancode.Escape);
    const rel: boolean[] = [];
    ctx.input.onRelativeMode = (e) => rel.push(e);
    ctx.input.mouseSetRelative(true);
    rel.length = 0;
    let frames = 0;
    ctx.frameSink = () => { frames++; if (frames === 1) down(ctx, Scancode.Escape); };
    expect(await levelInputTail(ctx)).toBe('continue');
    expect(rel).toEqual([false, true]);
    expect([v.ingamemenuPressed, v.yourInGameMenuRequest, v.skipStarShowVGA, ctx.input.keysactive[Scancode.Escape]])
      .toEqual([false, false, true, 0]);
    expect(v.reallyEndLevel).toBe(false);
  });
});

describeData('tab losing focus mid-level (Review Focus 3)', () => {
  it('blur pauses like !windowHasFocus and a key resumes (the focus event alone does not)', async () => {
    const { ctx, v, g } = setup();
    const target = new EventTarget();
    attachDomInput({ target, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 }) as DOMRect }, input: ctx.input, onToggleFullscreen: () => {}, doc: undefined });
    g.config.tyrMusicVolume = 200; g.config.fxVolume = 100;
    const vols: number[] = [];
    ctx.audio.setVolume = (m: number) => { vols.push(m); };
    // held Right key goes up with the blur (SDL releases it)
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'ArrowRight', key: '', altKey: false, ctrlKey: false, shiftKey: false, metaKey: false }));
    ctx.input.serviceEvents(true);
    target.dispatchEvent(new Event('blur'));
    ctx.input.serviceEvents(false); // the keyup; other input calls in the frame deliver the focus event
    ctx.input.serviceEvents(false);
    expect(ctx.input.windowHasFocus).toBe(false);
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    const s = onSleep(ctx, (n) => {
      if (n === 3) target.dispatchEvent(new Event('focus')); // back in the tab: still paused
      if (n === 8) target.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0, clientX: 4, clientY: 4 }));
    });
    expect(await levelInputTail(ctx)).toBe('continue');
    expect(frames).toBe(1); // "Paused" drawn once
    expect(s.sleeps()).toBeGreaterThanOrEqual(8); // not resumed by the focus event
    expect(ctx.input.windowHasFocus).toBe(true);
    expect(ctx.input.keysactive[Scancode.Right]).toBe(0);
    expect(vols).toEqual([100, 200]);
    expect(v.pauseGamePressed).toBe(false);
  });
});
