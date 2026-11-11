import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { getVersion } from '../cli/version';

describe('getVersion', () => {
  it('reports the version from the package manifest', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { version: string };
    expect(getVersion()).toBe(pkg.version);
  });

  it('returns a semver-shaped string even when the manifest is unreachable', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
