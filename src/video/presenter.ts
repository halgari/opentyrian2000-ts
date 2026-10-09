// SPDX-License-Identifier: GPL-2.0-or-later
// Replaces scale_and_flip: palette lookup + putImageData; CSS does the scaling.
import type { PaletteState } from './palette';
import type { Surface } from './surface';

export interface Presenter {
  present(screen: Surface, palette: PaletteState): void;
}

export class NullPresenter implements Presenter {
  present(): void {}
}

export function buildLut(palette: Uint8Array, out: Uint32Array): void {
  for (let i = 0; i < 256; i++) {
    out[i] = (0xff000000 | (palette[i * 3 + 2]! << 16) | (palette[i * 3 + 1]! << 8) | palette[i * 3]!) >>> 0;
  }
}

export class CanvasPresenter implements Presenter {
  private readonly ctx2d: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly out: Uint32Array;
  private readonly lut = new Uint32Array(256);
  private lutVersion = -1;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = 320;
    canvas.height = 200;
    this.ctx2d = canvas.getContext('2d', { alpha: false })!;
    this.image = this.ctx2d.createImageData(320, 200);
    this.out = new Uint32Array(this.image.data.buffer);
  }

  present(screen: Surface, palette: PaletteState): void {
    if (palette.version !== this.lutVersion) {
      buildLut(palette.current, this.lut);
      this.lutVersion = palette.version;
    }
    const px = screen.pixels, out = this.out, lut = this.lut;
    for (let i = 0; i < 64000; i++) out[i] = lut[px[i]!]!;
    this.ctx2d.putImageData(this.image, 0, 0);
  }
}
