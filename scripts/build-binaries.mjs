import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

// Produces one portable tarball: a single bundled CommonJS file with a Node
// shebang, so it runs anywhere Node >= 20 is installed. The JSON rule file is
// inlined by esbuild, so the archive is self-contained.
const dir = 'dist-bin';
const bundle = path.join(dir, 'soloknuckle');
const archive = path.join(dir, 'soloknuckle.tar.gz');

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

await build({
  entryPoints: ['cli/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logOverride: {
    'ignored-dynamic-require': 'silent',
    'umd-global-name': 'silent',
  },
  outfile: bundle,
});

execFileSync('chmod', ['+x', bundle]);
execFileSync('tar', ['-czf', archive, '-C', dir, 'soloknuckle']);

console.log(`Built ${archive}`);
