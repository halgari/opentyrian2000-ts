import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
describe('hosting config', () => {
  it('wrangler.jsonc serves ./dist as static assets and has no Worker entry or deploy hook', () => {
    const text = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const cfg = JSON.parse(text) as { name: string; assets: { directory: string }; main?: string };
    expect(cfg.assets.directory).toBe('./dist');
    expect(cfg.main).toBeUndefined();
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(Object.values(pkg.scripts).some((s) => /wrangler\s+(deploy|publish|pages)/.test(s))).toBe(false);
  });
  it('_headers has cache rules for assets, data and index, within Cloudflare limits', () => {
    const h = readFileSync(resolve(root, 'public/_headers'), 'utf8');
    expect(h).toMatch(/\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
    expect(h).toMatch(/\/data\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
    expect(h).toMatch(/\/index\.html\n\s+Cache-Control: no-cache/);
    expect(h).not.toMatch(/Cross-Origin-(Embedder|Opener)-Policy/);
    expect(h.split('\n').every((l) => l.length <= 2000)).toBe(true);
    expect(h.split('\n').filter((l) => /^\S/.test(l)).length).toBeLessThanOrEqual(100);
  });
  it('the README documents the manual deploy, the hosted build and the data licence caveat', () => {
    const r = readFileSync(resolve(root, 'README.md'), 'utf8');
    expect(r).toMatch(/## Deploy/);
    expect(r).toMatch(/halgari\.github\.io\/opentyrian2000-ts/);
    expect(r).toMatch(/All Rights Reserved/);
  });
});
