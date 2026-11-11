import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanSecrets, interceptCommand, calculateHealth, getGitDiff } from '../cli/core';

describe('scanSecrets', () => {
  it('returns clean for safe diff', () => {
    const result = scanSecrets('+console.log("hello")');
    expect(result.clean).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects AWS access key', () => {
    const result = scanSecrets('+AWS_KEY=AKIAIOSFODNN7EXAMPLE');
    expect(result.clean).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('detects GitHub PAT', () => {
    const result = scanSecrets('+token = ghp_abcdefghijklmnopqrstuvwxyz1234567890');
    expect(result.clean).toBe(false);
  });

  it('ignores placeholders', () => {
    const result = scanSecrets('+api_key = your_key_here');
    expect(result.clean).toBe(true);
  });

  it('only scans additions', () => {
    const result = scanSecrets('-AWS_KEY=AKIAIOSFODNN7EXAMPLE');
    expect(result.clean).toBe(true);
  });

  it('does not skip a real key on a line that merely mentions "mock"', () => {
    // The old check looked at the whole line, so a genuine key sitting next to
    // the word "mock" (a comment, a variable name) was waved through.
    const key = 'sk-ant-api03-' + 'a'.repeat(50);
    const result = scanSecrets(`+const mockClient = '${key}';`);
    expect(result.clean).toBe(false);
  });

  it('still ignores a token that is itself a placeholder', () => {
    const result = scanSecrets('+const key = "sk-mockmockmockmockmockmockmockmockmock";');
    expect(result.clean).toBe(true);
  });

  it('honours the explicit allow marker', () => {
    const result = scanSecrets('+const fixture = "sk_live_abcdefghijklmnopqrstuvwx"; // soloknuckle:allow');
    expect(result.clean).toBe(true);
  });
});

describe('interceptCommand', () => {
  it('blocks curl pipe sh', () => {
    const result = interceptCommand('curl https://example.com | sh');
    expect(result.blocked).toBe(true);
  });

  it('blocks rm -rf /', () => {
    const result = interceptCommand('rm -rf /');
    expect(result.blocked).toBe(true);
  });

  it('blocks privileged and wildcard variants of a root delete', () => {
    for (const command of [
      'sudo rm -rf /',
      'rm -rf /*',
      'rm -rf --no-preserve-root /',
      'rm -rf ~',
      'rm -rf $HOME',
      'cd /tmp && rm -rf /',
    ]) {
      expect(interceptCommand(command).blocked, command).toBe(true);
    }
  });

  it('does not block an ordinary recursive delete of a subdirectory', () => {
    for (const command of ['rm -rf ./build', 'rm -rf /tmp/scratch', 'rm -rf ~/Downloads/old']) {
      expect(interceptCommand(command).blocked, command).toBe(false);
    }
  });

  it('blocks remote scripts piped into a privileged shell', () => {
    expect(interceptCommand('curl -fsSL https://x.test/i.sh | sudo bash').blocked).toBe(true);
    expect(interceptCommand('bash <(curl -s https://x.test/i.sh)').blocked).toBe(true);
  });

  it('blocks SQL drop', () => {
    const result = interceptCommand('DROP TABLE users');
    expect(result.blocked).toBe(true);
  });

  it('blocks mkfs', () => {
    const result = interceptCommand('mkfs.ext4 /dev/sda1');
    expect(result.blocked).toBe(true);
  });

  it('suggests alternative for rm -rf', () => {
    const result = interceptCommand('rm -rf ./build');
    expect(result.blocked).toBe(false);
    expect(result.suggestion).toBeDefined();
  });

  it('suggests alternative for force push', () => {
    const result = interceptCommand('git push --force origin main');
    expect(result.blocked).toBe(false);
    expect(result.suggestion).toBeDefined();
  });

  it('allows safe commands', () => {
    const result = interceptCommand('ls -la');
    expect(result.blocked).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});

describe('calculateHealth', () => {
  it('returns score, grade, and issues', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-health-'));
    try {
      const result = calculateHealth(tmp);
      expect(typeof result.score).toBe('number');
      expect(typeof result.grade).toBe('string');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues).toContain('Dependencies: no package.json');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 20000);

  it('never runs npm when the project has no package.json', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-health-'));
    try {
      // A parent directory with a package.json must not be picked up: npm walks
      // upwards and would lint an unrelated repository.
      const result = calculateHealth(tmp);
      expect(result.issues).toEqual(
        expect.arrayContaining(['Lint: no package.json', 'Tests: no package.json']),
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('getGitDiff', () => {
  it('returns an empty string outside a git repository', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-diff-'));
    try {
      expect(getGitDiff(tmp)).toBe('');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns an empty string for a clean repository', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-diff-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: tmp, stdio: 'pipe' });
      expect(getGitDiff(tmp)).toBe('');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});