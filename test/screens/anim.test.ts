import { describe, expect, it } from 'vitest';
import { parseAnim } from '../../src/data/anim';
import { playAnim } from '../../src/screens/anim';
import { testCtx } from '../helpers/ctx';
import { describeData, testArchive } from '../helpers/data';

describeData('playAnim (JE_playAnim)', () => {
  it('shows a blank frame, then one frame per record except the last, with the file palette', async () => {
    const ctx = testCtx()!;
    const anim = parseAnim(testArchive!.get('tyrend.anm'))!;
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    await playAnim(ctx, 'tyrend.anm', 0, 7);
    expect(frames).toBe(1 + anim.nRecords - 1);
    expect(Array.from(ctx.palette.current.subarray(0, 768))).toEqual(Array.from(anim.palette));
    expect(ctx.palette.colors.subarray(0, 768)).toEqual(anim.palette);
  });

  it('a key press ends it after the frame being shown', async () => {
    const ctx = testCtx()!;
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 });
    await playAnim(ctx, 'tyrend.anm', 0, 7);
    expect(frames).toBe(2); // blank + frame 0
  });

  it('starts at startingframe and ignores a missing file', async () => {
    const ctx = testCtx()!;
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    await playAnim(ctx, 'nonexistent.anm', 0, 7);
    expect(frames).toBe(0);
    const anim = parseAnim(testArchive!.get('tyrend.anm'))!;
    await playAnim(ctx, 'tyrend.anm', anim.nRecords - 3, 1);
    expect(frames).toBe(1 + 2);
  });
});
