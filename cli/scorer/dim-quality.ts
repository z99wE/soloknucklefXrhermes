import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { scanDiffForSecretsAndPII, scanCodeForSecurityVulnerabilities, scanTextForSecrets } from '../scanner';
import { getErrorMessage, getExecErrorOutput, fileExists } from './helpers';
import type { DimensionScore } from './types';

// ─── Original 5 Pillars (Deepened & Enhanced) ──────────────────────────────

// Cache for quality results — lint & type analysis can be slow
let _lintResultCache: DimensionScore | null = null;
let _lintCacheCwd: string = '';

const CANDIDATE_SRC_DIRS = ['src', 'cli', 'lib', 'app', 'pages', 'components', 'api', 'ui/src'];
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Scans candidate source files in the project workspace, excluding node_modules, .git, dist, build, .next, etc.
 */
function scanSourceFiles(cwd: string, onFile: (fullPath: string, relPath: string, content: string) => void, includeTests = true) {
  const scanned = new Set<string>();

  const scanDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build' || entry === '.next' || entry === 'coverage') continue;
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (CODE_EXTENSIONS.some(ext => entry.endsWith(ext))) {
        if (!includeTests && (entry.includes('.test.') || entry.includes('.spec.') || fullPath.includes('/test/') || fullPath.includes('/tests/'))) {
          continue;
        }
        if (scanned.has(fullPath)) continue;
        scanned.add(fullPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const relPath = path.relative(cwd, fullPath) || entry;
        onFile(fullPath, relPath, content);
      }
    }
  };

  for (const candidate of CANDIDATE_SRC_DIRS) {
    scanDir(path.join(cwd, candidate));
  }
}

export function getQualityScore(): DimensionScore {
  const cwd = process.cwd();
  if (_lintResultCache && _lintCacheCwd === cwd) return _lintResultCache;
  try {
    let score = 100;
    let report = '';
    let hasLintScript = false;

    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts && pkg.scripts.lint) {
        hasLintScript = true;
        try {
          execSync('npm run lint', { encoding: 'utf-8', cwd, stdio: 'pipe' });
          report = 'Lint passed';
        } catch (e: unknown) {
          const output = getExecErrorOutput(e);
          const warningCount = (output.match(/warning/ig) || []).length;
          const errorCount = (output.match(/error/ig) || []).length;
          score = 100 - (errorCount * 10) - (warningCount * 5);
          report = output.substring(0, 1000);
        }
      }
    }

    if (!hasLintScript) {
      score = 50;
      report = 'No lint script found in package.json';
    }

    // Static Code Quality & Smell Inspection
    let smellDeductions = 0;
    let smellNotes = '';

    scanSourceFiles(cwd, (_fullPath, relPath, content) => {
      // 1. Leftover debugger statement
      const contentNoComments = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/\bdebugger\b\s*;?/.test(contentNoComments)) {
        smellDeductions += 10;
        smellNotes += `Debugger statement detected in ${relPath}.\n`;
      }

      // 2. Empty catch blocks swallowing errors
      if (/catch\s*(\([^\)]*\))?\s*\{\s*\}/.test(content)) {
        smellDeductions += 5;
        smellNotes += `Empty catch block swallowing errors in ${relPath}.\n`;
      }

      // 3. Excessive @ts-ignore or @ts-nocheck
      const tsIgnores = (content.match(/@ts-ignore|@ts-nocheck/g) || []).length;
      if (tsIgnores > 4) {
        smellDeductions += 5;
        smellNotes += `Excessive type suppressions (${tsIgnores}) in ${relPath}.\n`;
      }
    }, false);

    // Apply code smell deductions if lint passed cleanly
    if (hasLintScript && score === 100 && smellDeductions > 0) {
      score = Math.max(0, score - smellDeductions);
      report += `\n${smellNotes}`;
    }

    if (score < 0) score = 0;
    _lintCacheCwd = cwd;
    _lintResultCache = { score, rawOutput: report };
    return _lintResultCache;
  } catch (err: unknown) {
    _lintCacheCwd = cwd;
    _lintResultCache = { score: 0, rawOutput: `Fatal error analyzing quality: ${getErrorMessage(err)}` };
    return _lintResultCache;
  }
}

// Cache for test results to avoid re-running tests multiple times per invocation
let _testResultCache: DimensionScore | null = null;
let _testCacheCwd: string = '';

// Parse the actual count of failing tests instead of counting the raw word
// "fail" (which also matches speed strings like "12ms" and the word "failed"
// wherever it appears in output, wildly inflating the penalty).
function countFailedTests(output: string): number {
  // Jest: "Tests: 5 failed, 42 passed, 47 total"
  // Vitest: "Tests  5 failed | 9 passed"
  const summary = output.match(/Tests:?\s+[\s\S]*?(\d+)\s+failed/i);
  if (summary) return Number(summary[1]);
  const mochaSummary = output.match(/(\d+)\s+failing/i);
  if (mochaSummary) return Number(mochaSummary[1]);
  const failedWord = (output.match(/\bfailed\b/ig) || []).length;
  return failedWord;
}

export function getTestingScore(): DimensionScore {
  const cwd = process.cwd();
  if (_testResultCache && _testCacheCwd === cwd) return _testResultCache;
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts && pkg.scripts.test) {
        try {
          const output = execSync('npm run test 2>&1', { encoding: 'utf-8', cwd, stdio: 'pipe', timeout: 30000 });
          _testCacheCwd = cwd;
          _testResultCache = { score: 100, rawOutput: output.substring(0, 1000) };
          return _testResultCache;
        } catch (e: unknown) {
          const output = getExecErrorOutput(e);
          const failCount = countFailedTests(output);
          let score = 80 - (failCount * 20);
          if (score < 0) score = 0;
          _testCacheCwd = cwd;
          _testResultCache = { score, rawOutput: output.substring(0, 1000) };
          return _testResultCache;
        }
      }
    }
    _testCacheCwd = cwd;
    _testResultCache = { score: 0, rawOutput: 'No test script found in package.json' };
    return _testResultCache;
  } catch (err: unknown) {
    _testCacheCwd = cwd;
    _testResultCache = { score: 0, rawOutput: `Fatal error analyzing tests: ${getErrorMessage(err)}` };
    return _testResultCache;
  }
}

export function getSecurityScore(): DimensionScore {
  try {
    const cwd = process.cwd();
    let diff = '';
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd });
      diff = execSync('git diff --cached', { encoding: 'utf-8', cwd, stdio: 'pipe' });
      if (!diff) diff = execSync('git diff', { encoding: 'utf-8', cwd, stdio: 'pipe' });
    } catch (_e) {
      // No git repo or no diff available
    }

    const diffViolations = scanDiffForSecretsAndPII(diff);
    if (diffViolations.length > 0) {
      let score = 100 - (diffViolations.length * 25);
      if (score < 0) score = 0;
      return { score, rawOutput: diffViolations.join('\n') };
    }

    // Static SAST and Secret Code Scan across source workspace
    const staticViolations: string[] = [];
    scanSourceFiles(cwd, (_fullPath, relPath, content) => {
      if (relPath.endsWith('scanner.ts') || relPath.endsWith('scanner.js')) return;

      // 1. SAST Rules
      const sastIssues = scanCodeForSecurityVulnerabilities(content, relPath);
      for (const issue of sastIssues) {
        staticViolations.push(`[SAST] ${relPath}:${issue.line || 1} - ${issue.message}`);
      }

      // 2. Hardcoded secret scan in source files
      const secretIssues = scanTextForSecrets(content);
      for (const sec of secretIssues) {
        staticViolations.push(`[Secret] ${relPath} - ${sec}`);
      }
    }, false);


    if (staticViolations.length > 0) {
      let score = 100 - (staticViolations.length * 25);
      if (score < 0) score = 0;
      return { score, rawOutput: staticViolations.join('\n').substring(0, 1000) };
    }

    return { score: 100, rawOutput: 'No secrets or PII detected in diff.' };
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing security: ${getErrorMessage(err)}` };
  }
}

/**
 * Computes maximum block nesting depth for a given code string.
 */
function getMaxNestingDepth(content: string): number {
  let maxDepth = 0;
  let currentDepth = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '{') {
      currentDepth++;
      if (currentDepth > maxDepth) maxDepth = currentDepth;
    } else if (char === '}') {
      if (currentDepth > 0) currentDepth--;
    }
  }
  return maxDepth;
}

/**
 * Computes cognitive branching complexity of code.
 */
function countBranchingTokens(content: string): number {
  const branches = content.match(/\b(if|else\s+if|switch|case|for|while|catch)\b|\?\s*[^:]+\s*:|\&\&|\|\||\?\?/g);
  return branches ? branches.length : 0;
}

export function getEfficiencyScore(): DimensionScore {
  try {
    const cwd = process.cwd();
    let totalFiles = 0;
    let totalScore = 0;
    let report = '';

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'build' || file === '.next' || file === 'coverage') continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (CODE_EXTENSIONS.some(ext => file.endsWith(ext))) {
          if (file.includes('.test.') || file.includes('.spec.')) continue;
          totalFiles++;
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').length;
          const nesting = (content.match(/\{/g) || []).length;
          const maxDepth = getMaxNestingDepth(content);
          const branching = countBranchingTokens(content);

          let fileIssues = 0;

          // 1. File Length (> 500 lines)
          if (lines > 500) {
            fileIssues += 2;
            report += `${file} is extremely long (${lines} lines).\n`;
          }

          // 2. High brace count / deep nesting
          if (nesting > 150) {
            fileIssues++;
            report += `${file} has deep nesting.\n`;
          } else if (maxDepth > 4) {
            fileIssues++;
            report += `${file} has deep nesting.\n`;
          }

          // 3. High branching cognitive complexity
          if (branching > 45) {
            fileIssues++;
            report += `${file} has high branching complexity (${branching} branches).\n`;
          }

          // 4. Sequential async loop bottleneck (await inside for / while loop)
          if (/for\s*\([^)]*\)\s*\{[^}]*\bawait\s+/.test(content) || /while\s*\([^)]*\)\s*\{[^}]*\bawait\s+/.test(content)) {
            fileIssues++;
            report += `${file} contains sequential 'await' inside loop (consider Promise.all).\n`;
          }

          const fileScore = Math.max(0, 100 - (fileIssues * 10));
          totalScore += fileScore;
        }
      }
    };

    scanDir(path.join(cwd, 'src'));
    scanDir(path.join(cwd, 'cli'));

    if (totalFiles === 0) return { score: 100, rawOutput: 'Code structure appears highly efficient.' };

    const score = Math.round(totalScore / totalFiles);
    if (!report) report = 'Code structure appears highly efficient.';
    return { score, rawOutput: report.substring(0, 1000) };
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing efficiency: ${getErrorMessage(err)}` };
  }
}


