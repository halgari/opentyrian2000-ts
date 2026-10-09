import { describe, expect, it } from 'vitest';
import { cosf, f32, roundf32, sinf } from '../../src/core/cmath';
import { MersenneTwister } from '../../src/core/mtrand';
import type { Ctx } from '../../src/ctx';
import {
  doSP, drawExplosions, drawSP, setupExplosion, setupExplosionLarge, updateRepeatingExplosions,
} from '../../src/game/explosions';
import { createGameWorld, MAX_SUPERPIXELS } from '../../src/game/world';
import { createSurface } from '../../src/video/surface';

function mk(seed = 7): Ctx {
  const rng = new MersenneTwister();
  rng.srand(seed);
  return { rng, game: createGameWorld(), vga: { screen: createSurface(), screen2: createSurface(), gameScreen: createSurface() } } as unknown as Ctx;
}

describe('setupExplosion', () => {
  it('fills the first free slot from explosion_data', () => {
    const c = mk();
    setupExplosion(c, 10, 50, 3, 0, false, true);
    setupExplosion(c, 11, 51, 0, 12, true, false);
    setupExplosion(c, 12, 52, 0, 37, false, false);
    setupExplosion(c, 12, 52, 0, 53, false, false);
    const e = c.game.explosions.explosions;
    expect([e[0]!.sprite, e[0]!.ttl, e[0]!.deltaY, e[0]!.followPlayer, e[0]!.x, e[0]!.y]).toEqual([144, 7, 3, true, 10, 50]);
    expect([e[1]!.sprite, e[1]!.ttl, e[1]!.fixedPosition]).toEqual([76, 7, true]);
    expect([e[2]!.sprite, e[2]!.ttl]).toEqual([203, 8]);
    expect([e[3]!.sprite, e[3]!.ttl]).toEqual([96, 3]);
  });
  it('type 6 offsets the position; 98/198 map to 6 without offset; out-of-range y is ignored', () => {
    const c = mk();
    setupExplosion(c, 10, 50, 0, 6, false, false);
    setupExplosion(c, 10, 50, 0, 98, false, false);
    setupExplosion(c, 10, 190, 0, 0, false, false);
    setupExplosion(c, 10, -16, 0, 0, false, false);
    const e = c.game.explosions.explosions;
    expect([e[0]!.x, e[0]!.y, e[0]!.sprite, e[0]!.ttl]).toEqual([12, 62, 133, 7]);
    expect([e[1]!.x, e[1]!.y, e[1]!.sprite, e[1]!.ttl]).toEqual([10, 50, 133, 7]);
    expect(e[2]!.ttl).toBe(0);
  });
  it('large explosion spawns four and queues a repeating explosion', () => {
    const c = mk();
    setupExplosionLarge(c, true, 13, 100, 100);
    const e = c.game.explosions.explosions;
    expect(e.slice(0, 4).map((x) => [x.x, x.y, x.sprite])).toEqual([[94, 86, 190], [106, 86, 152], [94, 100, 209], [106, 100, 171]]);
    const r = c.game.explosions.repExplosions[0]!;
    expect([r.ttl, r.delay, r.x, r.y, r.big]).toEqual([3, 2, 100, 100, true]);
    setupExplosionLarge(c, false, 0, 100, -1);
    expect(c.game.explosions.repExplosions[1]!.ttl).toBe(0);
  });
});

describe('repeating explosions', () => {
  it('delay counts down, then spawns with C RNG order (small: 2 draws)', () => {
    const c = mk();
    setupExplosionLarge(c, true, 3, 100, 100);
    c.game.backgrounds.backMove2 = 2;
    updateRepeatingExplosions(c);
    expect(c.game.varz.enemyStillExploding).toBe(true);
    expect(c.rng.calls).toBe(0);
    updateRepeatingExplosions(c);
    updateRepeatingExplosions(c);
    expect(c.rng.calls).toBe(2);
    const r = c.game.explosions.repExplosions[0]!;
    expect([r.ttl, r.delay, r.y]).toEqual([2, 3, 103]);
    expect(c.game.varz.soundQueue[5]).toBe(4);
  });
  it('big: 3 draws, 4 if ttl != 1 (short-circuit)', () => {
    const c = mk();
    setupExplosionLarge(c, true, 12, 100, 100);
    c.game.explosions.repExplosions[0]!.delay = 0;
    updateRepeatingExplosions(c);
    expect(c.rng.calls).toBe(4);
    c.game.explosions.repExplosions[0]!.delay = 0;
    c.game.explosions.repExplosions[0]!.ttl = 1;
    updateRepeatingExplosions(c);
    expect(c.rng.calls).toBe(4 + 3);
    expect(c.game.varz.soundQueue[7]).toBe(11);
  });
});

describe('drawExplosions', () => {
  it('advances sprite/y, expires below 186, decrements ttl', () => {
    const c = mk();
    c.game.sprites.explosionSpriteSheet = { data: new Uint8Array(0) } as never;
    c.game.config.explosionTransparent = true;
    const e = c.game.explosions.explosions;
    e[0]!.ttl = 5; e[0]!.y = 186; e[0]!.sprite = 1;
    c.game.varz.explodeMove = 1;
    drawExplosions(c);
    expect([e[0]!.ttl, e[0]!.sprite, e[0]!.y]).toEqual([0, 2, 187]);
  });
});

describe('doSP / drawSP', () => {
  it('uses exactly 3 draws per particle in C order and clobbers scratch.temp', () => {
    const c = mk(), ref = new MersenneTwister();
    ref.srand(7);
    doSP(c, 100, 80, 4, 5, 0x70);
    expect(c.rng.calls).toBe(12);
    expect(c.game.scratch.temp).toBe(4);
    const tr = f32(ref.randLt1() * (2 * Math.PI));
    const ty = roundf32(f32(f32(cosf(tr) * ref.rand1()) * 5));
    const tx = roundf32(f32(f32(sinf(tr) * ref.rand1()) * 5));
    const s = c.game.explosions.superpixels[1]!;
    expect([s.x, s.y, s.deltaX, s.deltaY, s.color, s.z]).toEqual([tx + 100, ty + 80, tx, ty + 1, 0x70, 15]);
    expect(c.game.explosions.lastSuperpixel).toBe(4);
  });
  it('num 0 leaves temp 0; ring index wraps at 101', () => {
    const c = mk();
    c.game.scratch.temp = 9;
    doSP(c, 1, 1, 0, 3, 1);
    expect(c.game.scratch.temp).toBe(0);
    c.game.explosions.lastSuperpixel = MAX_SUPERPIXELS - 1;
    doSP(c, 1, 1, 1, 3, 1);
    expect(c.game.explosions.lastSuperpixel).toBe(0);
  });
  it('is deterministic for a seed', () => {
    const a = mk(3), b = mk(3);
    doSP(a, 50, 50, 30, 8, 0x20); doSP(b, 50, 50, 30, 8, 0x20);
    expect(a.game.explosions.superpixels).toEqual(b.game.explosions.superpixels);
  });
  it('drawSP moves, blends five pixels and decrements z', () => {
    const c = mk();
    const s = c.game.explosions.superpixels[0]!;
    Object.assign(s, { x: 10, y: 10, z: 15, deltaX: 1, deltaY: 2, color: 0x70 });
    const scr = c.vga.gameScreen;
    drawSP(c);
    expect(s.z).toBe(14);
    const at = (x: number, y: number) => scr.pixels[y * scr.pitch + x];
    expect([s.x, s.y]).toEqual([11, 12]);
    expect(at(11, 12)).toBe(((0 + 15) >> 1) + 0x70);
    expect(at(10, 12)).toBe(((0 + 7) >> 1) + 0x70);
    expect(at(11, 13)).toBe(((0 + 7) >> 1) + 0x70);
  });
  it('off-screen (unsigned wrap) particles are not drawn but still age', () => {
    const c = mk();
    const s = c.game.explosions.superpixels[5]!;
    Object.assign(s, { x: 0, y: 0, z: 2, deltaX: -3, deltaY: 0, color: 1 });
    drawSP(c);
    expect(s.z).toBe(1);
    expect(c.vga.gameScreen.pixels.some((v) => v !== 0)).toBe(false);
  });
});
