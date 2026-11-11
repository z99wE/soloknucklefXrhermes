import { describe, it, expect, vi } from 'vitest';

describe('getVersion fallback', () => {
  it('returns 0.0.0 when no package manifest can be found', async () => {
    vi.resetModules();
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return { default: { ...actual, existsSync: () => false } };
    });
    try {
      const mod = await import('../cli/version');
      expect(mod.getVersion()).toBe('0.0.0');
    } finally {
      vi.doUnmock('fs');
      vi.resetModules();
    }
  });
});
