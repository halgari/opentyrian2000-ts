// SPDX-License-Identifier: GPL-2.0-or-later
// Checks the output of `pnpm build:single`; skipped when dist-single/tyrian.html has not been built.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { base64ToBytes } from '../../src/platform/storage';
import { escapeScript } from '../../tools/build-single';

const FILE = join(import.meta.dirname, '..', '..', 'dist-single', 'tyrian.html');
const built = existsSync(FILE);

describe('escapeScript', () => {
  it('escapes </script and <!-- so the text cannot end or confuse the script element', () => {
    const out = escapeScript('a</script>b</SCRIPT>c<!--d');
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain('<!--');
  });
});

describe.skipIf(!built)('dist-single/tyrian.html', () => {
  const html = built ? readFileSync(FILE, 'utf8') : '';
  it('is under 8 MiB', () => {
    expect(statSync(FILE).size).toBeLessThan(8_388_608);
  });
  it('has one module script and two text/plain scripts', () => {
    expect(html.match(/<script type="module">/g)).toHaveLength(1);
    expect(html.match(/<script id="(worklet|data)" type="text\/plain">/g)).toHaveLength(2);
    expect(html.match(/<script\b/gi)).toHaveLength(3);
  });
  it('references nothing external and not the separate data pack', () => {
    expect(html).not.toMatch(/(src|href)="https?:/);
    expect(html).not.toContain('data/tyrian2000.t2kpak');
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
  });
  it('escapes </script inside the module body', () => {
    const body = html.slice(html.indexOf('<script type="module">') + 22);
    const end = body.indexOf('</script>');
    expect(body.slice(0, end)).not.toMatch(/<\/script/i);
  });
  it('carries a gzip data payload', () => {
    const m = /<script id="data" type="text\/plain">([^<]*)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const bytes = base64ToBytes(m![1]!);
    expect(bytes?.[0]).toBe(0x1f);
    expect(bytes?.[1]).toBe(0x8b);
  });
  it('shows the licence notice', () => {
    expect(html).toContain('GPL-2.0-or-later');
    expect(html).toContain('freeware release; see README');
    expect(html).toContain('https://github.com/KScl/opentyrian2000');
    expect(html).toMatch(/<div id="licence" hidden>/); // shown in the start overlay, never over the canvas
    expect(html).not.toMatch(/#licence\s*\{/);
  });
});
