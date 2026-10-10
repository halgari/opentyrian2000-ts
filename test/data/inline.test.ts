// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import { archiveFromInline } from '../../src/data/inline';
import { encodePak } from '../../src/data/pak';
import { bytesToBase64 } from '../../src/platform/storage';

const docWith = (text: string | null) => {
  const el = { textContent: text } as unknown as HTMLElement;
  return {
    el,
    doc: { getElementById: (id: string) => (id === 'data' && text !== null ? el : null) } as unknown as Document,
  };
};

describe('inline data', () => {
  it('decodes base64 gzip pak into an archive and clears the element', async () => {
    const pak = encodePak([{ name: 'hello.txt', data: new TextEncoder().encode('hi') }]);
    const { doc, el } = docWith(bytesToBase64(gzipSync(pak, { level: 9 })));
    const arc = await archiveFromInline(doc);
    expect(new TextDecoder().decode(arc.get('hello.txt'))).toBe('hi');
    expect(el.textContent).toBe('');
  });
  it('a missing data element is a readable error', async () => {
    await expect(archiveFromInline(docWith(null).doc)).rejects.toThrow(/embedded game data/i);
  });
  it('damaged base64 is a readable error', async () => {
    await expect(archiveFromInline(docWith('!!!not base64!!!').doc)).rejects.toThrow(/embedded game data/i);
  });
  it('a browser without DecompressionStream says so', async () => {
    const g = globalThis as { DecompressionStream?: unknown };
    const saved = g.DecompressionStream;
    g.DecompressionStream = undefined;
    try {
      const pak = encodePak([{ name: 'a', data: new Uint8Array(1) }]);
      await expect(archiveFromInline(docWith(bytesToBase64(gzipSync(pak))).doc)).rejects.toThrow(/DecompressionStream/);
    } finally { g.DecompressionStream = saved; }
  });
});
