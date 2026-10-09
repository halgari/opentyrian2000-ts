// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/backgrnd.c (lava_filter, water_filter, iced_blur_filter, blur_filter)

// The smoothie filters read `dst` (game_screen) before writing it, so they depend on the previous frame's final picture:
// the caller must keep one persistent game_screen surface across frames. Every index below stays inside the 320x200 buffer.
import type { Surface } from '../video/surface';

// port of lava_filter (backgrnd.c:320)
export function lavaFilter(dst: Surface, src: Surface): void {
  const dp = dst.pixels, sp = src.pixels;
  const dstPitch = dst.pitch, srcPitch = src.pitch;
  let d = 185 * dstPitch;
  let s = 185 * srcPitch;
  let w = 320 * 185 - 1;

  for (let y = 185 - 1; y >= 0; --y) {
    d -= dstPitch - 320;
    s -= srcPitch - 320;
    for (let x = 320 - 1; x >= 0; x -= 8) {
      const waver = Math.abs(((w >> 9) & 0x0f) - 8) - 1;
      w -= 8;
      for (let xi = 8 - 1; xi >= 0; --xi) {
        --d;
        --s;
        // average of the source pixel (2x), the destination pixel above and below (all with waver); hue is red
        let value = 0;
        if (s + waver >= 0) value += (sp[s + waver]! & 0x0f) * 2;
        value += dp[d + waver + dstPitch]! & 0x0f;
        if (d + waver - dstPitch >= 0) value += dp[d + waver - dstPitch]! & 0x0f;
        dp[d] = ((value & 0xff) >> 2) | 0x70;
      }
    }
  }
}

// port of water_filter (backgrnd.c:367); `hueData` is smoothie_data[1]
export function waterFilter(dst: Surface, src: Surface, hueData: number): void {
  const hue = (hueData << 4) & 0xff;
  const dp = dst.pixels, sp = src.pixels;
  const dstPitch = dst.pitch, srcPitch = src.pitch;
  let d = 185 * dstPitch;
  let s = 185 * srcPitch;
  let w = 320 * 185 - 1;

  for (let y = 185 - 1; y >= 0; --y) {
    d -= dstPitch - 320;
    s -= srcPitch - 320;
    for (let x = 320 - 1; x >= 0; x -= 8) {
      const waver = Math.abs(((w >> 10) & 0x07) - 4) - 1;
      w -= 8;
      for (let xi = 8 - 1; xi >= 0; --xi) {
        --d;
        --s;
        // copied from the source unless blue, else the average of the source and the destination pixel below (with waver)
        const c = sp[s]!;
        if ((c & 0x30) === 0) {
          dp[d] = c;
        } else {
          const value = (c & 0x0f) + (dp[d + waver + dstPitch]! & 0x0f);
          dp[d] = (value >> 1) | hue;
        }
      }
    }
  }
}

// port of iced_blur_filter (backgrnd.c:410): average of source and destination, icy blue hue
export function icedBlurFilter(dst: Surface, src: Surface): void {
  const dp = dst.pixels, sp = src.pixels;
  let d = 0, s = 0;
  for (let y = 0; y < 184; ++y) {
    for (let x = 0; x < 320; ++x) {
      const value = (sp[s]! & 0x0f) + (dp[d]! & 0x0f);
      dp[d] = (value >> 1) | 0x80;
      ++d;
      ++s;
    }
    d += dst.pitch - 320;
    s += src.pitch - 320;
  }
}

// port of blur_filter (backgrnd.c:439): average of source and destination, hue of the source
export function blurFilter(dst: Surface, src: Surface): void {
  const dp = dst.pixels, sp = src.pixels;
  let d = 0, s = 0;
  for (let y = 0; y < 184; ++y) {
    for (let x = 0; x < 320; ++x) {
      const c = sp[s]!;
      const value = (c & 0x0f) + (dp[d]! & 0x0f);
      dp[d] = (value >> 1) | (c & 0xf0);
      ++d;
      ++s;
    }
    d += dst.pitch - 320;
    s += src.pitch - 320;
  }
}
