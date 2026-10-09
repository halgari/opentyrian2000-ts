// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/varz.c (JE_playerDamage)
import { S_EXPLOSION_22, S_HULL_HIT, S_SHIELD_HIT } from '../audio/ids';
import { u32, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { setupExplosion } from './explosions';
import { drawArmor, drawShield, wipeShieldArmorBars } from './hud';
import type { Player } from './world';

// port of JE_playerDamage (varz.c:1041), ported by task 9 (needed by the enemy shot collision). Task 12 need not port it.
// `temp` is the JE_byte damage; returns the damage dealt through the shield (0 when the shield absorbed it all).
export function playerDamage(ctx: Ctx, temp: number, thisPlayer: Player): number {
  const g = ctx.game;
  const v = g.varz;
  let damage = 0;
  temp = u8(temp);
  v.soundQueue[7] = S_SHIELD_HIT;

  /* Player Damage Routines */
  if (thisPlayer.shield < temp) {
    damage = temp;
    temp = u8(temp - thisPlayer.shield);
    thisPlayer.shield = 0;

    if (temp > 0) {
      /*Through Shields - Now Armor */

      if (thisPlayer.armor < temp) {
        temp = u8(temp - thisPlayer.armor);
        thisPlayer.armor = 0;

        if (thisPlayer.isAlive && !g.config.youAreCheating) {
          if (!g.config.timedBattleMode) v.levelTimer = false;
          thisPlayer.isAlive = false;
          thisPlayer.explodingTicks = 60;
          v.levelEnd = 40;
          g.config.tempVolume = g.config.tyrMusicVolume;
          v.soundQueue[1] = S_EXPLOSION_22;
        }
      } else {
        thisPlayer.armor = u32(thisPlayer.armor - temp);
        v.soundQueue[7] = S_HULL_HIT;
      }
    }
  } else {
    thisPlayer.shield = u32(thisPlayer.shield - temp);

    const follow = !g.config.twoPlayerMode;
    setupExplosion(ctx, thisPlayer.x - 17, thisPlayer.y - 12, 0, 14, false, follow);
    setupExplosion(ctx, thisPlayer.x - 5, thisPlayer.y - 12, 0, 15, false, follow);
    setupExplosion(ctx, thisPlayer.x + 7, thisPlayer.y - 12, 0, 16, false, follow);
    setupExplosion(ctx, thisPlayer.x + 19, thisPlayer.y - 12, 0, 17, false, follow);

    setupExplosion(ctx, thisPlayer.x - 17, thisPlayer.y + 2, 0, 18, false, follow);
    setupExplosion(ctx, thisPlayer.x + 19, thisPlayer.y + 2, 0, 19, false, follow);

    setupExplosion(ctx, thisPlayer.x - 17, thisPlayer.y + 16, 0, 20, false, follow);
    setupExplosion(ctx, thisPlayer.x - 5, thisPlayer.y + 16, 0, 21, false, follow);
    setupExplosion(ctx, thisPlayer.x + 7, thisPlayer.y + 16, 0, 22, false, follow);
  }

  wipeShieldArmorBars(ctx);
  // VGAScreen = VGAScreenSeg for the two draws (side-effect of game_screen in the C), restored afterwards
  drawShield(ctx, ctx.vga.screen);
  drawArmor(ctx, ctx.vga.screen);

  return damage;
}
