import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { scanSecrets, interceptCommand, REDACTION_PATTERNS, RULES } from '../cli/core';

// Soloknuckle has two engines: the TypeScript one that serves the CLI and the
// MCP server, and a self-contained Python one inside the Hermes plugin (Hermes
// must not shell out to `npx` to answer a tool call). They share one rule file,
// but shared data does not guarantee shared behaviour. This test runs the same
// corpus through both and fails on the first disagreement.

const corpusPath = path.resolve(process.cwd(), 'test/fixtures/parity-corpus.json');
const probePath = path.resolve(process.cwd(), 'hermes-plugin/tests/parity_probe.py');

interface Corpus {
  diffs: string[];
  commands: string[];
}

interface ProbeResult {
  secrets: Array<{ clean: boolean; violations: string[] }>;
  commands: Array<{ blocked: boolean; reason: string | null; suggestion: string | null }>;
  redaction_patterns: string[];
}

const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8')) as Corpus;

function findPython(): string | null {
  const candidates = [
    process.env.SOLOKNUCKLE_PYTHON,
    'python3',
    'python',
    'py',
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], {
        stdio: 'pipe',
        timeout: 15000,
      });
      return candidate;
    } catch {
      // try the next interpreter
    }
  }
  return null;
}

const python = findPython();

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-bin', 'coverage', '.cache']);

/** Repo-relative paths of every JSON file outside build and vendor folders. */
function jsonFilesUnderRepoRoot(dir = process.cwd()): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      found.push(...jsonFilesUnderRepoRoot(path.join(dir, entry.name)));
      continue;
    }
    if (!entry.name.endsWith('.json')) continue;
    found.push(path.relative(process.cwd(), path.join(dir, entry.name)).split(path.sep).join('/'));
  }
  return found.sort();
}

function runProbe(interpreter: string): ProbeResult {
  const output = execFileSync(interpreter, [probePath, corpusPath], {
    encoding: 'utf-8',
    timeout: 60000,
  });
  return JSON.parse(output) as ProbeResult;
}

describe('engine parity (TypeScript <-> Python)', () => {
  it('has a Python interpreter to compare against', () => {
    expect(
      python,
      'No Python interpreter found. The Hermes plugin is Python, so parity cannot be '
      + 'checked. Set SOLOKNUCKLE_PYTHON to an interpreter path.',
    ).not.toBeNull();
  });

  it('agrees on every secret-scan case', () => {
    const probe = runProbe(python as string);
    expect(probe.secrets).toHaveLength(corpus.diffs.length);

    corpus.diffs.forEach((diff, index) => {
      expect(
        scanSecrets(diff),
        `scan_secrets disagreed on corpus diff #${index}: ${JSON.stringify(diff)}`,
      ).toEqual(probe.secrets[index]);
    });
  });

  it('agrees on every command-firewall case', () => {
    const probe = runProbe(python as string);
    expect(probe.commands).toHaveLength(corpus.commands.length);

    corpus.commands.forEach((command, index) => {
      const ours = interceptCommand(command);
      const theirs = probe.commands[index];
      const normalize = (value: { blocked: boolean; reason?: string | null; suggestion?: string | null }) => ({
        blocked: value.blocked,
        reason: value.reason ?? null,
        suggestion: value.suggestion ?? null,
      });
      expect(
        normalize(ours),
        `intercept_command disagreed on corpus command #${index}: ${JSON.stringify(command)}`,
      ).toEqual(normalize(theirs));
    });
  });

  it('derives the same redaction patterns from the shared rule file', () => {
    const probe = runProbe(python as string);
    expect(probe.redaction_patterns).toEqual(REDACTION_PATTERNS);
  });

  it('never hands Hermes a pattern it would refuse', () => {
    // Hermes requires at least two literal prefix characters and rejects
    // top-level alternation, so a bad rule would silently vanish at runtime.
    for (const pattern of REDACTION_PATTERNS) {
      expect(pattern.startsWith('('), `top-level alternation: ${pattern}`).toBe(false);
      const prefix = pattern.slice(0, 2);
      expect(
        /^[A-Za-z0-9]{2}$/.test(prefix) || pattern.startsWith('-----BEGIN'),
        `weak literal prefix: ${pattern}`,
      ).toBe(true);
    }
  });
});

describe('shared rule file', () => {
  it('compiles every pattern and declares what each rule needs', () => {
    expect(RULES.version).toBeGreaterThanOrEqual(1);
    expect(RULES.secret_patterns.length).toBeGreaterThan(10);

    for (const rule of RULES.secret_patterns) {
      expect(() => new RegExp(rule.pattern, rule.flags ?? ''), rule.label).not.toThrow();
      expect(typeof rule.redact, rule.label).toBe('boolean');
    }
    for (const rule of [...RULES.destructive_patterns, ...RULES.advisory_patterns]) {
      expect(() => new RegExp(rule.pattern, rule.flags ?? ''), rule.reason).not.toThrow();
      expect(rule.reason.length, rule.pattern).toBeGreaterThan(0);
    }
    for (const rule of RULES.advisory_patterns) {
      expect(rule.suggestion, rule.reason).toBeTruthy();
    }
  });

  it('is the only rule file in the repository', () => {
    // A second copy would drift. Anything that defines `secret_patterns` must
    // be the one file both engines load.
    const ruleFiles = jsonFilesUnderRepoRoot().filter(file =>
      fs.readFileSync(file, 'utf8').includes('"secret_patterns"'),
    );
    expect(ruleFiles).toEqual(['hermes-plugin/rules.json']);
  });
});
