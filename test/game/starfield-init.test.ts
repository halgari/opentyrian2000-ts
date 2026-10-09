import { expect, it } from 'vitest';
import { MersenneTwister } from '../../src/core/mtrand';
import { initializeStarfield } from '../../src/game/backgrounds';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('initializeStarfield', () => {
  it('draws 4 values per star (x, y, speed, color), stars 99..0, x = mt%320 before y = mt%200', () => {
    const ctx = testCtx()!;
    const ref = new MersenneTwister();
    ref.srand(1);
    ctx.rng.srand(1);
    initializeStarfield(ctx);
    expect(ctx.rng.calls).toBe(400);

    const s = ctx.game.backgrounds.starfieldStars;
    for (let i = 99; i >= 0; i--) {
      const x = ref.rand() % 320;
      const y = ref.rand() % 200;
      expect(s.position[i]).toBe(x + y * 320);
      expect(s.speed[i]).toBe((ref.rand() % 3) + 2);
      expect(s.color[i]).toBe((ref.rand() % 16) + 0x90);
    }
  });
});
