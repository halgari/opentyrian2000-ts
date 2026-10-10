// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/varz.c (explosions, superpixels) and the explosion passes of src/tyrian2.c JE_main
import { S_EXPLOSION_11, S_EXPLOSION_4, S_EXPLOSION_9 } from '../audio/ids';
import { cosf, f32, roundf32, sinf } from '../core/cmath';
import { s16, u16, u32, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { blitSprite2, blitSprite2Blend } from '../video/sprite2';
import { MAX_REPEATING_EXPLOSIONS, MAX_SUPERPIXELS, MAX_EXPLOSIONS } from './world';

/** explosion_data[54] of JE_setupExplosion: [sprite, ttl] */
export const EXPLOSION_DATA: ReadonlyArray<readonly [number, number]> = [
  [144, 7], [120, 12], [190, 12], [209, 12], [152, 12], [171, 12],
  [133, 7], [1, 12], [20, 12], [39, 12], [58, 12], [110, 3],
  [76, 7], [91, 3], [227, 3], [230, 3], [233, 3], [252, 3],
  [246, 3], [249, 3], [265, 3], [268, 3], [271, 3], [236, 3],
  [239, 3], [242, 3], [261, 3], [274, 3], [277, 3], [280, 3],
  [299, 3], [284, 3], [287, 3], [290, 3], [293, 3], [165, 8],
  [184, 8], [203, 8], [222, 8], [168, 8], [187, 8], [206, 8],
  [225, 10], [169, 10], [188, 10], [207, 20], [226, 14], [170, 14],
  [189, 14], [208, 14], [246, 14], [227, 14], [265, 14], [96, 3]
];

/** JE_setupExplosion (varz.c:874) */
export function setupExplosion(
  ctx: Ctx, x: number, y: number, deltaY: number, type: number, fixedPosition: boolean, followPlayer: boolean,
): void {
  x = s16(x); y = s16(y); deltaY = s16(deltaY); type = s16(type);
  if (y > -16 && y < 190) {
    const list = ctx.game.explosions.explosions;
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const e = list[i]!;
      if (e.ttl === 0) {
        e.x = x;
        e.y = y;
        if (type === 6) {
          e.y = s16(e.y + 12);
          e.x = s16(e.x + 2);
        } else if (type === 98 || type === 198) {
          type = 6;
        }
        const d = EXPLOSION_DATA[type];
        if (d === undefined) throw new Error(`setupExplosion: explosion type ${type} out of range`);
        e.sprite = d[0];
        e.ttl = d[1];
        e.followPlayer = followPlayer;
        e.fixedPosition = fixedPosition;
        e.deltaY = deltaY;
        break;
      }
    }
  }
}

/** JE_setupExplosionLarge (varz.c:951) */
export function setupExplosionLarge(ctx: Ctx, enemyGround: boolean, exploNum: number, x: number, y: number): void {
  x = s16(x); y = s16(y); exploNum = u8(exploNum);
  if (y >= 0) {
    if (enemyGround) {
      setupExplosion(ctx, x - 6, y - 14, 0, 2, false, false);
      setupExplosion(ctx, x + 6, y - 14, 0, 4, false, false);
      setupExplosion(ctx, x - 6, y, 0, 3, false, false);
      setupExplosion(ctx, x + 6, y, 0, 5, false, false);
    } else {
      setupExplosion(ctx, x - 6, y - 14, 0, 7, false, false);
      setupExplosion(ctx, x + 6, y - 14, 0, 9, false, false);
      setupExplosion(ctx, x - 6, y, 0, 8, false, false);
      setupExplosion(ctx, x + 6, y, 0, 10, false, false);
    }

    let big: boolean;
    if (exploNum > 10) {
      exploNum -= 10;
      big = true;
    } else {
      big = false;
    }

    if (exploNum) {
      const reps = ctx.game.explosions.repExplosions;
      for (let i = 0; i < MAX_REPEATING_EXPLOSIONS; i++) {
        const r = reps[i]!;
        if (r.ttl === 0) {
          r.ttl = exploNum;
          r.delay = 2;
          r.x = u32(x);
          r.y = u32(y);
          r.big = big;
          break;
        }
      }
    }
  }
}

/** tyrian2.c:1897-1937: sequenced (repeating) explosions */
export function updateRepeatingExplosions(ctx: Ctx): void {
  const g = ctx.game;
  const reps = g.explosions.repExplosions;
  for (let i = 0; i < MAX_REPEATING_EXPLOSIONS; i++) {
    const r = reps[i]!;
    if (r.ttl !== 0) {
      g.varz.enemyStillExploding = true;

      if (r.delay > 0) {
        r.delay--;
        continue;
      }

      r.y = u32(r.y + g.backgrounds.backMove2 + 1);
      const tempX = s16(r.x + (ctx.rng.rand() % 24) - 12);
      const tempY = s16(r.y + (ctx.rng.rand() % 27) - 24);

      if (r.big) {
        setupExplosionLarge(ctx, false, 2, tempX, tempY);

        if (r.ttl === 1 || ctx.rng.rand() % 5 === 1) g.varz.soundQueue[7] = S_EXPLOSION_11;
        else g.varz.soundQueue[6] = S_EXPLOSION_9;

        r.delay = 4 + (ctx.rng.rand() % 3);
      } else {
        setupExplosion(ctx, tempX, tempY, 0, 1, false, false);

        g.varz.soundQueue[5] = S_EXPLOSION_4;

        r.delay = 3;
      }

      r.ttl--;
    }
  }
}

/** tyrian2.c:1939-1965: explosion sprite pass (VGAScreen is game_screen in the loop) */
export function drawExplosions(ctx: Ctx): void {
  const g = ctx.game;
  const list = g.explosions.explosions;
  const sheet = g.sprites.explosionSpriteSheet;
  const screen = ctx.vga.cur;
  for (let j = 0; j < MAX_EXPLOSIONS; j++) {
    const e = list[j]!;
    if (e.ttl !== 0) {
      if (!e.fixedPosition) {
        e.sprite = u16(e.sprite + 1);
        e.y = s16(e.y + g.varz.explodeMove);
      } else if (e.followPlayer) {
        e.x = s16(e.x + g.explosions.explosionFollowAmountX);
        e.y = s16(e.y + g.explosions.explosionFollowAmountY);
      }
      e.y = s16(e.y + e.deltaY);

      if (e.y > 200 - 14) {
        e.ttl = 0;
      } else {
        if (sheet === null) throw new Error('drawExplosions: explosion sprite sheet not loaded');
        if (g.config.explosionTransparent) blitSprite2Blend(screen, e.x, e.y, sheet, e.sprite + 1);
        else blitSprite2(screen, e.x, e.y, sheet, e.sprite + 1);

        e.ttl--;
      }
    }
  }
}

/** JE_doSP (varz.c:1148): superpixels. Clobbers the scratch global `temp` (a JE_byte loop counter). */
export function doSP(ctx: Ctx, x: number, y: number, num: number, explowidth: number, color: number): void {
  const g = ctx.game;
  const sp = g.explosions.superpixels;
  x = u16(x); y = u16(y); num = u16(num);
  for (g.scratch.temp = 0; g.scratch.temp < num; g.scratch.temp = u8(g.scratch.temp + 1)) {
    const tempr = f32(ctx.rng.randLt1() * (2 * Math.PI));
    const tempy = roundf32(f32(f32(cosf(tempr) * ctx.rng.rand1()) * explowidth)) | 0;
    const tempx = roundf32(f32(f32(sinf(tempr) * ctx.rng.rand1()) * explowidth)) | 0;

    if (++g.explosions.lastSuperpixel >= MAX_SUPERPIXELS) g.explosions.lastSuperpixel = 0;
    const s = sp[g.explosions.lastSuperpixel]!;
    s.x = u32(tempx + x);
    s.y = u32(tempy + y);
    s.deltaX = tempx;
    s.deltaY = tempy + 1;
    s.color = u8(color);
    s.z = 15;
  }
}

/** JE_drawSP (varz.c:1170): drawn on VGAScreen (game_screen in the loop) */
export function drawSP(ctx: Ctx): void {
  const sp = ctx.game.explosions.superpixels;
  const scr = ctx.vga.cur;
  const px = scr.pixels;
  const pitch = scr.pitch;
  for (let i = MAX_SUPERPIXELS; i--; ) {
    const s = sp[i]!;
    if (s.z) {
      s.x = u32(s.x + s.deltaX);
      s.y = u32(s.y + s.deltaY);

      if (s.x < scr.w && s.y < scr.h) {
        const o = s.y * pitch + s.x;
        const h = s.z >> 1;
        px[o] = (((px[o]! & 0x0f) + s.z) >> 1) + s.color;
        if (s.x > 0) px[o - 1] = (((px[o - 1]! & 0x0f) + h) >> 1) + s.color;
        if (s.x < scr.w - 1) px[o + 1] = (((px[o + 1]! & 0x0f) + h) >> 1) + s.color;
        if (s.y > 0) px[o - pitch] = (((px[o - pitch]! & 0x0f) + h) >> 1) + s.color;
        if (s.y < scr.h - 1) px[o + pitch] = (((px[o + pitch]! & 0x0f) + h) >> 1) + s.color;
      }

      s.z--;
    }
  }
}
