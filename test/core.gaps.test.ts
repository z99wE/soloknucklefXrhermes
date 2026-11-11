import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { compile, getGitDiff } from '../cli/core';

describe('core coverage gaps', () => {
  it('getGitDiff returns empty string outside a git repository', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soloknuckle-nogit-'));
    try {
      expect(getGitDiff(dir)).toBe('');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('compile throws a clear error for an invalid regex pattern', () => {
    expect(() => compile('[unterminated', 'i')).toThrow(/Invalid rule pattern/);
  });
});
