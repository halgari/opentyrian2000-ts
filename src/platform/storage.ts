// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/config.c (the user directory: tyrian.sav / tyrian.cfg / opentyrian.cfg), replaced by browser storage

/**
 * Synchronous string key/value store standing in for the C user directory. Binary files are stored
 * base64 so the on-disk bytes stay identical to the C files (see save.ts).
 */
export interface StorageAdapter {
  get(key: string): string | null;
  /** Returns false if the value could not be stored persistently (it is still readable from memory). */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /** True while writes actually reach persistent storage. */
  readonly persistent: boolean;
}

/** Keys used by the game (one per C file). */
export const STORAGE_KEYS = {
  sav: 'opentyrian.tyrian.sav',
  cfg: 'opentyrian.tyrian.cfg',
  opentyrianCfg: 'opentyrian.opentyrian.cfg.json',
  corruptSavPrefix: 'opentyrian.tyrian.sav.corrupt.',
} as const;

export function memoryAdapter(): StorageAdapter {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => { m.set(k, v); return true; },
    remove: (k) => { m.delete(k); },
    persistent: false,
  };
}

/** The subset of the DOM Storage interface used here (so tests can inject fakes). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * localStorage-backed adapter. Every access is guarded: when localStorage is blocked (private mode,
 * disabled site data) or a write fails (quota), the game keeps running from an in-memory mirror and
 * a single console warning is logged. Reads always prefer the mirror so a failed write is not lost
 * within the session.
 */
export function localStorageAdapter(storage?: StorageLike | null | (() => StorageLike | null)): StorageAdapter {
  const mem = memoryAdapter();
  let backing: StorageLike | null = null;
  let warned = false;
  const warn = (why: string, e?: unknown): void => {
    if (warned) return;
    warned = true;
    console.warn(`opentyrian: browser storage unavailable (${why}); saves are kept in memory for this session only`, e ?? '');
  };

  try {
    const s = typeof storage === 'function' ? storage() : storage !== undefined ? storage : (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
    if (s) {
      const probe = 'opentyrian.__probe';
      s.setItem(probe, '1');
      s.removeItem(probe);
      backing = s;
    } else warn('no localStorage');
  } catch (e) {
    warn('blocked', e);
  }

  const a: StorageAdapter = {
    get(k) {
      const inMem = mem.get(k);
      if (inMem !== null) return inMem;
      if (!backing) return null;
      try { return backing.getItem(k); } catch (e) { warn('read failed', e); return null; }
    },
    set(k, v) {
      if (!backing) { mem.set(k, v); return false; }
      try {
        backing.setItem(k, v);
        mem.remove(k); // persisted: the backing store is the source of truth again
        return true;
      } catch (e) {
        warn('write failed (quota?)', e);
        mem.set(k, v);
        return false;
      }
    },
    remove(k) {
      mem.remove(k);
      if (!backing) return;
      try { backing.removeItem(k); } catch (e) { warn('remove failed', e); }
    },
    get persistent() { return backing !== null; },
  };
  return a;
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}

/** Returns null for malformed base64. */
export function base64ToBytes(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
