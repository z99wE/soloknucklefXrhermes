import fs from 'fs';
import path from 'path';

/**
 * The installed package version, read from the package.json that ships with
 * the CLI. Works in both layouts:
 *  - installed/published: dist/cli/*.js -> ../../package.json
 *  - running from source (tsx / vitest): cli/*.ts -> ../package.json
 * Falls back to 0.0.0 only if no package.json can be found.
 */
export function getVersion(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'package.json'),
    path.join(__dirname, '..', 'package.json'),
  ];
  for (const pkgPath of candidates) {
    try {
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
      if (typeof pkg.version === 'string') return pkg.version;
    } catch {
      // try the next candidate
    }
  }
  return '0.0.0';
}
