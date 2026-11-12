// core.ts — Unified hygiene engine for Soloknuckle.
//
// One rule set (`hermes-plugin/rules.json`) drives the TypeScript CLI/MCP
// engine and the self-contained Python Hermes plugin. Adding a pattern in that
// file changes every surface at once, and `test/parity.test.ts` fails the build
// if the two engines ever disagree about what it means.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import rulesFile from '../hermes-plugin/rules.json';

// ---------------------------------------------------------------------------
// Rule loading (compiled once per process)
// ---------------------------------------------------------------------------
interface SecretRule {
  label: string;
  pattern: string;
  flags?: string;
  redact: boolean;
  redact_pattern?: string;
  note?: string;
}

interface CommandRule {
  reason: string;
  pattern: string;
  flags?: string;
  suggestion?: string;
}

interface RulesFile {
  version: number;
  allow_marker: string;
  placeholder_tokens: string[];
  secret_patterns: SecretRule[];
  destructive_patterns: CommandRule[];
  advisory_patterns: CommandRule[];
}

export const RULES = rulesFile as unknown as RulesFile;

interface CompiledSecretRule {
  label: string;
  regex: RegExp;
}

interface CompiledCommandRule {
  reason: string;
  regex: RegExp;
  suggestion?: string;
}

export function compile(source: string, flags = ''): RegExp {
  try {
    return new RegExp(source, flags);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid rule pattern ${JSON.stringify(source)}: ${message}`);
  }
}

const SECRET_RULES: CompiledSecretRule[] = RULES.secret_patterns.map(rule => ({
  label: rule.label,
  regex: compile(rule.pattern, rule.flags),
}));

const DESTRUCTIVE_RULES: CompiledCommandRule[] = RULES.destructive_patterns.map(rule => ({
  reason: rule.reason,
  regex: compile(rule.pattern, rule.flags),
}));

const ADVISORY_RULES: CompiledCommandRule[] = RULES.advisory_patterns.map(rule => ({
  reason: rule.reason,
  regex: compile(rule.pattern, rule.flags),
  suggestion: rule.suggestion,
}));

const PLACEHOLDER_TOKENS = RULES.placeholder_tokens.map(token => token.toLowerCase());
const ALLOW_MARKER = RULES.allow_marker.toLowerCase();

/** Patterns Hermes may use to redact transcripts. Derived, never hand-kept. */
export const REDACTION_PATTERNS: string[] = RULES.secret_patterns
  .filter(rule => rule.redact)
  .map(rule => rule.redact_pattern ?? rule.pattern);

/**
 * A match is a documented placeholder only when the *matched text* looks like
 * one. Checking the whole line (the old behaviour) silently skipped a real key
 * that merely sat on a line mentioning "mock" or "localhost".
 */
function isPlaceholderMatch(match: string): boolean {
  const lower = match.toLowerCase();
  return PLACEHOLDER_TOKENS.some(token => lower.includes(token));
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface SecretScanResult {
  clean: boolean;
  violations: string[];
}

export interface InterceptResult {
  blocked: boolean;
  reason?: string;
  suggestion?: string;
}

export interface HealthResult {
  score: number;
  grade: string;
  issues: string[];
}

// ---------------------------------------------------------------------------
// scanSecrets
// ---------------------------------------------------------------------------
export function scanSecrets(diff: string): SecretScanResult {
  const violations: string[] = [];
  const lines = diff.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only additions can introduce a secret; skip headers and removals.
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    // Explicit, greppable escape hatch for fixtures and documentation.
    if (line.toLowerCase().includes(ALLOW_MARKER)) continue;

    for (const { label, regex } of SECRET_RULES) {
      const match = regex.exec(line);
      if (!match) continue;
      if (isPlaceholderMatch(match[0])) continue;
      violations.push(`Line ${i + 1}: ${label} detected.`);
      break;
    }
  }

  return { clean: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// interceptCommand
// ---------------------------------------------------------------------------
export function interceptCommand(command: string): InterceptResult {
  for (const { reason, regex } of DESTRUCTIVE_RULES) {
    if (regex.test(command)) {
      return { blocked: true, reason, suggestion: undefined };
    }
  }
  for (const { reason, regex, suggestion } of ADVISORY_RULES) {
    if (regex.test(command)) {
      return { blocked: false, reason, suggestion };
    }
  }
  return { blocked: false, reason: undefined, suggestion: undefined };
}

// ---------------------------------------------------------------------------
// calculateHealth
// ---------------------------------------------------------------------------
export function calculateHealth(root: string = process.cwd()): HealthResult {
  const issues: string[] = [];
  let checksPassed = 0;
  const totalChecks = 4;
  const cwd = root;
  const hasPackageJson = fs.existsSync(path.join(cwd, 'package.json'));

  // 1. Dependency check
  if (hasPackageJson) {
    checksPassed++;
  } else {
    issues.push('Dependencies: no package.json');
  }

  // 2. Lint check — only inside an npm project: without a local package.json
  // `npm` walks up to a parent directory and lints someone else's repository.
  // Run the project's own script (side effects by definition) with no shell and
  // explicit timeouts, using a minimal environment (never inheriting secrets).
  const env = minimalEnv();
  if (!hasPackageJson) {
    issues.push('Lint: no package.json');
  } else {
    try {
      execFileSync('npm', ['run', 'lint', '--silent'], {
        encoding: 'utf-8',
        timeout: 30000,
        stdio: 'pipe',
        cwd,
        env,
      });
      checksPassed++;
    } catch (e: any) {
      issues.push(e.status !== undefined ? 'Lint: failing' : 'Lint: no lint script or timed out');
    }
  }

  // 3. Test check
  if (!hasPackageJson) {
    issues.push('Tests: no package.json');
  } else {
    try {
      execFileSync('npm', ['test', '--silent', '--run'], {
        encoding: 'utf-8',
        timeout: 60000,
        stdio: 'pipe',
        cwd,
        env,
      });
      checksPassed++;
    } catch (e: any) {
      issues.push(e.status !== undefined ? 'Tests: failing' : 'Tests: no test script or timed out');
    }
  }

  // 4. Secrets check
  try {
    const result = scanSecrets(getGitDiff(cwd));
    if (result.clean) {
      checksPassed++;
    } else {
      issues.push(`Secrets: ${result.violations.length} violation(s)`);
    }
  } catch {
    issues.push('Secrets: not a git repo');
  }

  const score = Math.round((checksPassed / totalChecks) * 100);
  const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 40 ? 'C' : 'F';

  return { score, grade, issues: issues.slice(0, 5) };
}

// ---------------------------------------------------------------------------
// Git diff helper
// ---------------------------------------------------------------------------
function minimalEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'LANG', 'TERM'] as const) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('NODE_') && value) env[key] = value;
  }
  return env;
}

export function getGitDiff(cwd: string = process.cwd()): string {
  const env = minimalEnv();
  try {
    let diff = execFileSync('git', ['diff', '--cached'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
      cwd,
      env,
    });
    if (!diff) {
      diff = execFileSync('git', ['diff'], {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
        cwd,
        env,
      });
    }
    return diff;
  } catch {
    return '';
  }
}
