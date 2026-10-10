// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: none (web-only): keeps several tabs sharing one tyrian.sav from erasing each other's saves,
//   and writes the configuration files when the page is hidden or closed.
import type { Ctx } from '../ctx';
import { STORAGE_KEYS } from '../platform/storage';
import {
  decryptSaveTemp, parseSav, readStoredSav, readT2kTail, saveConfigFiles, SAV_FILE_SIZE, SAVE_RECORD_SIZE,
  packSaveTemp, serializeSav, unpackSaveTemp,
} from './save';
import { SAVE_FILE_SIZE, SAVE_FILES_NUM, SIZEOF_SAVEGAMETEMP, type ConfigGroup } from './world';

/** Web-only multi-tab state, lives on `ctx.saveSync`. */
export interface SaveSync {
  /** Plain image (see plainSav) of what this tab last read from or wrote to storage; null before the first load. */
  baseline: Uint8Array | null;
}

export function newSaveSync(): SaveSync { return { baseline: null }; }

/** Decrypted saveTemp (checksum bytes zeroed) followed by the high-score tail; null on a short file or bad checksum. */
export function plainSav(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < SAV_FILE_SIZE) return null;
  const out = bytes.slice(0, SAV_FILE_SIZE);
  const head = out.subarray(0, SIZEOF_SAVEGAMETEMP);
  if (decryptSaveTemp(head).length) return null;
  head.fill(0, SAVE_FILE_SIZE, SIZEOF_SAVEGAMETEMP);
  return out;
}

/** Plain image of the live state of `c`, leaving `c.saveTemp` as it was. */
export function snapshotPlain(c: ConfigGroup): Uint8Array {
  const keep = c.saveTemp.slice();
  try {
    return plainSav(serializeSav(c))!;
  } finally {
    c.saveTemp.set(keep);
  }
}

const sameRange = (a: Uint8Array, b: Uint8Array, from: number, to: number): boolean => {
  for (let i = from; i < to; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * Three-way merge of tyrian.sav before this tab writes it: every slot (and every byte of the editor/ship-edit
 * area, and the high-score tail as one block) that this tab left alone but another tab changed is taken from storage.
 */
export function mergeStoredSav(ctx: Ctx): void {
  const c = ctx.game.config;
  const baseline = ctx.saveSync.baseline;
  const raw = readStoredSav(ctx);
  const stored = raw && plainSav(raw);
  if (!stored || !baseline) return;
  packSaveTemp(c); // saveConfiguration packs next anyway; the merge edits the packed image
  const cur = plainSav(serializeSav(c))!;

  let changed = false;
  const take = (from: number, to: number): void => {
    if (sameRange(cur, baseline, from, to) && !sameRange(stored, baseline, from, to)) {
      c.saveTemp.set(stored.subarray(from, to), from);
      changed = true;
    }
  };
  for (let i = 0; i < SAVE_FILES_NUM; i++) take(i * SAVE_RECORD_SIZE, (i + 1) * SAVE_RECORD_SIZE);
  for (let b = SAVE_FILES_NUM * SAVE_RECORD_SIZE; b < SAVE_FILE_SIZE; b++) take(b, b + 1);
  if (sameRange(cur, baseline, SIZEOF_SAVEGAMETEMP, SAV_FILE_SIZE) && !sameRange(stored, baseline, SIZEOF_SAVEGAMETEMP, SAV_FILE_SIZE)) {
    readT2kTail(c, stored, SIZEOF_SAVEGAMETEMP);
    changed = true;
  }
  if (changed) unpackSaveTemp(c);
}

/** Re-reads tyrian.sav (another tab wrote it); true if that changed anything. A corrupt image is ignored. */
export function reloadSavesFromStorage(ctx: Ctx): boolean {
  const raw = readStoredSav(ctx);
  const plain = raw && plainSav(raw);
  if (!raw || !plain) return false;
  const base = ctx.saveSync.baseline;
  if (base && sameRange(plain, base, 0, SAV_FILE_SIZE)) return false;
  if (parseSav(ctx.game.config, raw).length) return false;
  ctx.saveSync.baseline = plain;
  return true;
}

/** The `storage` event: another tab changed tyrian.sav. */
export function attachSaveSync(target: EventTarget, ctx: Ctx): () => void {
  const l = (e: Event): void => {
    if ((e as StorageEvent).key === STORAGE_KEYS.sav && ctx.game.config.configurationLoaded) reloadSavesFromStorage(ctx);
  };
  target.addEventListener('storage', l);
  return () => target.removeEventListener('storage', l);
}

/** pagehide / visibilitychange->hidden: write tyrian.cfg and opentyrian.cfg (never tyrian.sav). */
export function attachPageLifecycle(target: EventTarget, doc: EventTarget & { visibilityState: string }, ctx: Ctx): () => void {
  const onHide = (): void => saveConfigFiles(ctx);
  const onVis = (): void => { if (doc.visibilityState === 'hidden') saveConfigFiles(ctx); };
  target.addEventListener('pagehide', onHide);
  doc.addEventListener('visibilitychange', onVis);
  return () => {
    target.removeEventListener('pagehide', onHide);
    doc.removeEventListener('visibilitychange', onVis);
  };
}

/** Records what was just written to storage as this tab's baseline. */
export function noteWritten(ctx: Ctx, image: Uint8Array): void {
  ctx.saveSync.baseline = plainSav(image);
}
