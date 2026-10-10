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

/** Plain image of the live state of `c` (packs `c.saveTemp`, which every save does anyway). */
export function snapshotPlain(c: ConfigGroup): Uint8Array {
  return plainSav(serializeSav(c))!;
}

const sameRange = (a: Uint8Array, b: Uint8Array, from: number, to: number): boolean => {
  for (let i = from; i < to; i++) if (a[i] !== b[i]) return false;
  return true;
};

const EDITOR_LEVEL_AT = SIZEOF_SAVEGAMETEMP - 6; // 2 bytes (hi, lo), merged as one unit

/**
 * Three-way merge of `stored` (plain image) into the live state: every slot (the editor/ship-edit area per byte,
 * editorLevel as one 2-byte unit, the high-score tail as one block) that this tab left alone since `baseline`
 * but `stored` changed is taken from `stored`. Local edits win. Returns true if anything was taken.
 */
function mergeInto(c: ConfigGroup, baseline: Uint8Array, stored: Uint8Array, forWrite: boolean): boolean {
  packSaveTemp(c); // saveConfiguration packs next anyway; the merge edits the packed image
  const cur = snapshotPlain(c);
  let changed = false;
  const take = (from: number, to: number): void => {
    if (sameRange(cur, baseline, from, to) && !sameRange(stored, baseline, from, to)) {
      c.saveTemp.set(stored.subarray(from, to), from);
      changed = true;
    }
  };
  for (let i = 0; i < SAVE_FILES_NUM; i++) take(i * SAVE_RECORD_SIZE, (i + 1) * SAVE_RECORD_SIZE);
  for (let b = SAVE_FILES_NUM * SAVE_RECORD_SIZE; b < EDITOR_LEVEL_AT; b++) take(b, b + 1);
  take(EDITOR_LEVEL_AT, SAVE_FILE_SIZE);
  if (sameRange(cur, baseline, SIZEOF_SAVEGAMETEMP, SAV_FILE_SIZE) && !sameRange(stored, baseline, SIZEOF_SAVEGAMETEMP, SAV_FILE_SIZE)) {
    readT2kTail(c, stored, SIZEOF_SAVEGAMETEMP);
    changed = true;
  }
  if (changed) {
    // unpackSaveTemp re-derives editorLevel with the C's hi/lo asymmetry (loaded = lo<<8|hi). A locally edited
    // value is kept. A taken value follows a load when reloading, but before a write it must keep the stored
    // bytes, so it is set to what packSaveTemp turns back into them.
    const level = c.editorLevel;
    const tookLevel = sameRange(cur, baseline, EDITOR_LEVEL_AT, SAVE_FILE_SIZE) && !sameRange(stored, baseline, EDITOR_LEVEL_AT, SAVE_FILE_SIZE);
    unpackSaveTemp(c);
    if (!tookLevel) c.editorLevel = level;
    else if (forWrite) c.editorLevel = ((c.saveTemp[EDITOR_LEVEL_AT]! << 8) | c.saveTemp[EDITOR_LEVEL_AT + 1]!);
  }
  return changed;
}

/** Called by saveConfiguration before it serialises: keeps other tabs' saves. */
export function mergeStoredSav(ctx: Ctx): void {
  const baseline = ctx.saveSync.baseline;
  const raw = readStoredSav(ctx);
  const stored = raw && plainSav(raw);
  if (!stored || !baseline) return;
  mergeInto(ctx.game.config, baseline, stored, true);
}

/**
 * Re-reads tyrian.sav (another tab wrote it) and merges it into the live state without losing unsaved local
 * edits; true if that changed anything. A corrupt image is ignored.
 */
export function reloadSavesFromStorage(ctx: Ctx): boolean {
  const raw = readStoredSav(ctx);
  const stored = raw && plainSav(raw);
  if (!raw || !stored) return false;
  const base = ctx.saveSync.baseline;
  if (base && sameRange(stored, base, 0, SAV_FILE_SIZE)) return false;
  const changed = base ? mergeInto(ctx.game.config, base, stored, false) : parseSav(ctx.game.config, raw).length === 0;
  ctx.saveSync.baseline = stored;
  return changed;
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
