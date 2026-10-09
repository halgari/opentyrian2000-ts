import { describe, expect, it } from 'vitest';
import { FRAME_RECORD_SIZE, parseFrames } from './frames';

describe('parseFrames', () => {
  it('parses consecutive records', () => {
    const buf = new Uint8Array(FRAME_RECORD_SIZE * 2);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 0, true);
    view.setUint32(FRAME_RECORD_SIZE, 1, true);
    buf[4] = 200;                        // frame 0 palette[0].r
    buf[FRAME_RECORD_SIZE + 4 + 768] = 9; // frame 1 pixel (0,0)
    const frames = parseFrames(buf);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.palette[0]).toBe(200);
    expect(frames[1]!.index).toBe(1);
    expect(frames[1]!.pixels[0]).toBe(9);
    expect(frames[1]!.pixels.length).toBe(64000);
  });
  it('rejects a partial record', () => {
    expect(() => parseFrames(new Uint8Array(FRAME_RECORD_SIZE + 1))).toThrow(/partial/);
  });
});
