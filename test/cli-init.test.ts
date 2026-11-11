import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { installHook, runInit, hookBody, HOOK_MARKER } from '../cli/index';

function mktemp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('init hooks (single source)', () => {
  it('hook bodies carry the marker and chain logic', () => {
    for (const name of ['pre-commit', 'commit-msg', 'pre-push'] as const) {
      const body = hookBody(name);
      expect(body).toContain(HOOK_MARKER);
      expect(body).toContain('chain_local');
      expect(body.startsWith('#!/usr/bin/env bash')).toBe(true);
    }
    expect(hookBody('commit-msg')).toContain('Conventional Commits');
    expect(hookBody('pre-commit')).toContain('soloknuckle secrets');
    expect(hookBody('pre-push')).toContain('soloknuckle check');
  });

  it('installHook preserves an existing hook as .local and chains it', () => {
    const dir = mktemp('sk-hook-');
    try {
      const hooksDir = path.join(dir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const pre = path.join(hooksDir, 'pre-commit');
      fs.writeFileSync(pre, '#!/bin/sh\necho original\n');
      fs.chmodSync(pre, 0o755);

      const note = installHook(hooksDir, 'pre-commit');
      expect(note).toContain('.local');
      expect(fs.existsSync(pre + '.local')).toBe(true);
      expect(fs.readFileSync(pre + '.local', 'utf8')).toContain('echo original');
      const installed = fs.readFileSync(pre, 'utf8');
      expect(installed).toContain(HOOK_MARKER);
      expect(installed).toContain('chain_local');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('installHook is idempotent when hook is already ours', () => {
    const dir = mktemp('sk-hook-');
    try {
      const hooksDir = path.join(dir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      installHook(hooksDir, 'pre-commit');
      const first = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf8');
      const note = installHook(hooksDir, 'pre-commit');
      const second = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf8');
      expect(note).toBe('');
      expect(second).toBe(first);
      expect(fs.existsSync(path.join(hooksDir, 'pre-commit.local'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('installHook keeps existing hook if .local chain target already exists', () => {
    const dir = mktemp('sk-hook-');
    try {
      const hooksDir = path.join(dir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const pre = path.join(hooksDir, 'pre-commit');
      const local = path.join(hooksDir, 'pre-commit.local');
      fs.writeFileSync(pre, '#!/bin/sh\necho foreign\n');
      fs.writeFileSync(local, '#!/bin/sh\necho chained\n');
      const note = installHook(hooksDir, 'pre-commit');
      expect(note).toContain('already exists');
      expect(fs.readFileSync(local, 'utf8')).toContain('echo chained');
      expect(fs.readFileSync(pre, 'utf8')).toContain(HOOK_MARKER);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runInit scaffolds AGENTS and all hooks in a git repo, idempotently', () => {
    const dir = mktemp('sk-init-');
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      const first = runInit(dir);
      expect(first.inGitRepo).toBe(true);
      expect(first.createdAgents).toBe(true);
      expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
      for (const name of ['pre-commit', 'commit-msg', 'pre-push'] as const) {
        const p = path.join(dir, '.git', 'hooks', name);
        expect(fs.existsSync(p)).toBe(true);
        expect(fs.readFileSync(p, 'utf8')).toContain(HOOK_MARKER);
      }

      const second = runInit(dir);
      expect(second.createdAgents).toBe(false);
      for (const name of ['pre-commit', 'commit-msg', 'pre-push'] as const) {
        expect(second.hooks[name]).toBe('');
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runInit creates AGENTS but skips hooks outside a git repo', () => {
    const dir = mktemp('sk-nogit-');
    try {
      const res = runInit(dir);
      expect(res.inGitRepo).toBe(false);
      expect(res.createdAgents).toBe(true);
      expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, '.git'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
