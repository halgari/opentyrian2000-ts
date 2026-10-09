// SPDX-License-Identifier: GPL-2.0-or-later
import { decodePak } from './pak';

export const DATA_URL = 'data/tyrian2000.t2kpak';

export class DataArchive {
  private readonly files = new Map<string, Uint8Array>();

  constructor(files: Map<string, Uint8Array>) {
    for (const [k, v] of files) this.files.set(k.toLowerCase(), v);
  }

  get(name: string): Uint8Array {
    const f = this.files.get(name.toLowerCase());
    if (!f) throw new Error(`missing data file: ${name}`);
    return f;
  }

  has(name: string): boolean {
    return this.files.has(name.toLowerCase());
  }

  names(): string[] {
    return [...this.files.keys()];
  }

  /** Accepts a PAK, optionally gzip-compressed (detected by the 1f 8b magic). */
  static async fromPakBytes(bytes: Uint8Array): Promise<DataArchive> {
    let raw = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
      raw = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return new DataArchive(decodePak(raw));
  }
}

export async function fetchArchive(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<DataArchive> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download game data from ${url} (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let p = 0;
  for (const c of chunks) { bytes.set(c, p); p += c.length; }
  return DataArchive.fromPakBytes(bytes);
}
