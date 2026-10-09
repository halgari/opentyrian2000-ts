// SPDX-License-Identifier: GPL-2.0-or-later
import type { DataArchive } from './data/archive';
import { loadHelpText, type HelpText } from './data/helptext';
import { loadPalettes } from './data/palette-file';
import { PicFile } from './data/pic';
import { loadMainShapeTables, type MainShapes } from './data/shapes';

export interface Assets {
  archive: DataArchive;
  palettes: Uint8Array[];
  pics: PicFile;
  shapes: MainShapes;
  helpText: HelpText;
}

/** Loads what main() loads before the title screen (xmas is always off). */
export function loadAssets(archive: DataArchive): Assets {
  return {
    archive,
    helpText: loadHelpText(archive.get('tyrian.hdt')),
    palettes: loadPalettes(archive.get('palette.dat')),
    shapes: loadMainShapeTables(archive.get('tyrian.shp')),
    pics: new PicFile(archive.get('tyrian.pic')),
  };
}
