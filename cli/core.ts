// core.ts — Unified hygiene engine for Soloknuckle
// Single source of truth: CLI, git hooks, MCP, and IDE all call these functions.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Secret patterns (credentials only)
// ---------------------------------------------------------------------------
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk_live_[0-9a-zA-Z]{24}/, label: 'Stripe live key' },
  { pattern: /rk_live_[0-9a-zA-Z]{24}/, label: 'Stripe restricted key' },
  { pattern: /sk-[a-zA-Z0-9]{32,}/, label: 'OpenAI/Anthropic-style API key' },
  { pattern: /sk-proj-[0-9A-Za-z_-]{20,}/, label: 'OpenAI project API key' },
  { pattern: /sk-ant-api[0-9]{2}-[0-9A-Za-z_-]{40,}/, label: 'Anthropic API key' },
  { pattern: /xox[baprs]-[a-zA-Z0-9-]+/, label: 'Slack token' },
  { pattern: /AKIA[0-9A-Z]{16}/, label: 'AWS access key' },
  { pattern: /ASIA[0-9A-Z]{16}/, label: 'AWS temporary access key' },
  { pattern: /ghp_[A-Za-z0-9]{36}/, label: 'GitHub personal access token' },
  { pattern: /github_pat_[A-Za-z0-9_]{22,}/, label: 'GitHub fine-grained PAT' },
  { pattern: /ghs_[A-Za-z0-9]{36}/, label: 'GitHub server-to-server token' },
  { pattern: /gho_[A-Za-z0-9]{36}/, label: 'GitHub OAuth token' },
  { pattern: /npm_[A-Za-z0-9]{36}/, label: 'npm access token' },
  { pattern: /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}/, label: 'SendGrid API key' },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/, label: 'GCP API key' },
  { pattern: /\bglpat-[0-9A-Za-z_-]{20,}/, label: 'GitLab personal access token' },
  { pattern: /\bhf_[A-Za-z0-9]{16,}/, label: 'Hugging Face access token' },
  { pattern: /shpat_[0-9a-fA-F]{32}/, label: 'Shopify access token' },
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY/, label: 'Private key' },
  { pattern: /(?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|mariadb):\/\/[a-zA-Z0-9_\-\.]+:[^@\s"']+@[a-zA-Z0-9_\-\.]+/i, label: 'Database URI with credentials' },
];

const PLACEHOLDER_WORDS = ['your_key_here', 'placeholder', 'xxxx', 'localhost', 'mock', 'dummy', 'changeme', '<token>'];

function isPlaceholder(line: string): boolean {
  const lower = line.toLowerCase();
  return PLACEHOLDER_WORDS.some(w => lower.includes(w));
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
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const { pattern, label } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        if (isPlaceholder(line)) continue;
        violations.push(`Line ${i + 1}: ${label} detected.`);
        break;
      }
    }
  }
  return { clean: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// interceptCommand
// ---------------------------------------------------------------------------
const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /curl\s+.*\|\s*(?:ba|z|k|c|tc)?sh/i, reason: 'Piping remote script to shell' },
  { pattern: /wget\s+.*\|\s*(?:ba|z|k|c|tc)?sh/i, reason: 'Piping remote script to shell' },
  { pattern: /\brm\s+-rf\s+\/\s*$/i, reason: 'Recursive delete of root' },
  { pattern: /\bdd\s+if=.*of=\/dev\//i, reason: 'Raw disk write' },
  { pattern: /\bmkfs\b/i, reason: 'Filesystem format' },
  { pattern: /\bDROP\s+(?:DATABASE|TABLE|SCHEMA)\b/i, reason: 'SQL drop' },
];

const SUGGEST_PATTERNS: Array<{ pattern: RegExp; reason: string; suggestion: string }> = [
  { pattern: /\brm\s+-rf\b/i, reason: 'Recursive force delete', suggestion: "Use 'rm -i' or 'trash-put' instead" },
  { pattern: /\bgit\s+push\s+(?:--force|-f)\b/i, reason: 'Force push', suggestion: "Use '--force-with-lease' instead" },
  { pattern: /\bchmod\s+(?:-R\s+)?777\b/i, reason: 'Overly permissive chmod', suggestion: "Use 'chmod 644' or 'chmod u=rwx,go=rx' instead" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: 'Hard reset', suggestion: "Use 'git stash' or 'git reset --soft' instead" },
];

export function interceptCommand(command: string): InterceptResult {
  for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      return { blocked: true, reason, suggestion: undefined };
    }
  }
  for (const { pattern, reason, suggestion } of SUGGEST_PATTERNS) {
    if (pattern.test(command)) {
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
  if (!hasPackageJson) {
    issues.push('Lint: no package.json');
  } else {
    try {
      execSync('npm run lint --silent', { encoding: 'utf-8', timeout: 30000, stdio: 'pipe', cwd });
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
      execSync('npm test --silent --run', { encoding: 'utf-8', timeout: 60000, stdio: 'pipe', cwd });
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
export function getGitDiff(cwd: string = process.cwd()): string {
  try {
    let diff = execSync('git diff --cached', { encoding: 'utf-8', timeout: 10000, stdio: 'pipe', cwd });
    if (!diff) {
      diff = execSync('git diff', { encoding: 'utf-8', timeout: 10000, stdio: 'pipe', cwd });
    }
    return diff;
  } catch {
    return '';
  }
}