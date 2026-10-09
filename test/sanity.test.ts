import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version';

describe('scaffold', () => {
  it('exposes a version string', () => {
    expect(VERSION).toMatch(/^ts-/);
  });
});
