import { describe, it, expect } from 'vitest';
import { scanSecrets, interceptCommand, calculateHealth } from '../cli/core';

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
    const result = calculateHealth();
    expect(typeof result.score).toBe('number');
    expect(typeof result.grade).toBe('string');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  }, 120000);
});