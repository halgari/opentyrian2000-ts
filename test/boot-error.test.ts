// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { formatBootError } from '../src/boot-error';

describe('formatBootError', () => {
  it('explains missing data', () => {
    expect(formatBootError(new Error('could not download game data from data/tyrian2000.t2kpak (HTTP 404)')))
      .toMatch(/pnpm data/);
  });
  it('explains a corrupt pack', () => {
    expect(formatBootError(new Error('not a Tyrian data pack (bad magic)'))).toMatch(/pnpm data/);
  });
  it('falls back to the message', () => {
    expect(formatBootError('boom')).toContain('boom');
  });
});
