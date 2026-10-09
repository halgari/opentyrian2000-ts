import type { Ctx } from '../../src/ctx';
import { STORAGE_KEYS, bytesToBase64 } from '../../src/platform/storage';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const EPEND_SAV = resolve(__dirname, '../../test-data/ts-save/episode-end.sav');
export const setupFor = (ctx: Ctx): void => { ctx.storage.set(STORAGE_KEYS.sav, bytesToBase64(new Uint8Array(readFileSync(EPEND_SAV)))); };
