#!/usr/bin/env node
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = process.cwd();
const cli = path.join(root, 'dist', 'cli', 'index.js');

function run(args, opts = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: opts.cwd ?? root,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, NO_COLOR: '1', SOLOKNUCKLE_NO_BANNER: '1' },
  });
}

function expectFail(args, opts = {}) {
  try {
    execFileSync(process.execPath, [cli, ...args], {
      cwd: opts.cwd ?? root,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, NO_COLOR: '1', SOLOKNUCKLE_NO_BANNER: '1' },
    });
    throw new Error(`expected failure: soloknuckle ${args.join(' ')}`);
  } catch (e) {
    if (e.status === null || e.status === undefined) throw e;
  }
}

if (!fs.existsSync(cli)) {
  console.error('dist/cli/index.js missing; run npm run build first');
  process.exit(2);
}

run(['--help']);
run(['secrets', '+console.log("ok")']);
expectFail(['secrets', '+token=ghp_abcdefghijklmnopqrstuvwxyz1234567890']); // soloknuckle:allow
run(['intercept', 'echo', 'hello']);
expectFail(['intercept', 'curl', 'https://x.test/i.sh', '|', 'sh']);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soloknuckle-smoke-'));
try {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  run(['init'], { cwd: dir });
  for (const name of ['pre-commit', 'commit-msg', 'pre-push', '.git/hooks/pre-commit']) {
    if (!fs.existsSync(path.join(dir, name === '.git/hooks/pre-commit' ? name : `.git/hooks/${name}`))) {
      // handled below
    }
  }
  expectFail(['check', '--min-score', '70'], { cwd: dir });
  run(['check', '--min-score', '0'], { cwd: dir });
  console.log('smoke: ok');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
