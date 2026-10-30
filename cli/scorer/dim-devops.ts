import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getErrorMessage, fileExists } from './helpers';
import type { DimensionScore } from './types';
export function getGitHygieneScore(): DimensionScore {
  try {
    let score = 100;
    let report = '';

    // Check if in a git repo
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: process.cwd() });
    } catch {
      return { score: 30, rawOutput: 'Not a git repository. Git hygiene checks skipped.' };
    }

    // Check for direct commits to main
    try {
      const mainBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: process.cwd() }).trim();
      if (mainBranch === 'main' || mainBranch === 'master') {
        score -= 15;
        report += `Currently on '${mainBranch}' branch. Use feature branches.\n`;
      }
    } catch {
      // skip
    }

    // Check recent commit messages for conventional commits pattern
    try {
      const log = execSync('git log --oneline -20', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
      const lines = log.trim().split('\n').filter(Boolean);
      const conventionalPattern = /^(feat|fix|docs|style|refactor|test|chore|ci|perf|build|revert)(\(.+\))?: /;
      const conventionalCount = lines.filter(l => conventionalPattern.test(l.split(' ').slice(1).join(' '))).length;
      const ratio = lines.length > 0 ? conventionalCount / lines.length : 0;

      if (ratio >= 0.8) {
        report += `Excellent commit message hygiene (${conventionalCount}/${lines.length} conventional).\n`;
      } else if (ratio >= 0.5) {
        score -= 10;
        report += `Mixed commit messages (${conventionalCount}/${lines.length} conventional). Consider using conventional commits.\n`;
      } else {
        score -= 20;
        report += `Poor commit message hygiene (${conventionalCount}/${lines.length} conventional).\n`;
      }
    } catch {
      // skip
    }

    // Check for .gitignore
    if (fileExists('.gitignore')) {
      const gi = fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf-8');
      const important = ['node_modules', '.env', 'dist', '.soloknuckle'];
      const missing = important.filter(i => !gi.includes(i));
      if (missing.length > 0) {
        score -= 5 * missing.length;
        report += `.gitignore missing: ${missing.join(', ')}.\n`;
      } else {
        report += '.gitignore covers common patterns.\n';
      }
    } else {
      score -= 20;
      report += 'No .gitignore found.\n';
    }

    if (score < 0) score = 0;
    return { score, rawOutput: report || 'Git hygiene looks good.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking git hygiene: ${getErrorMessage(err)}` };
  }
}

export function getCIPipelineScore(): DimensionScore {
  try {
    let score = 0;
    let report = '';

    const ciPaths = [
      { file: '.github/workflows', points: 40, label: 'GitHub Actions', isDir: true },
      { file: '.gitlab-ci.yml', points: 40, label: 'GitLab CI', isDir: false },
      { file: '.circleci/config.yml', points: 40, label: 'CircleCI', isDir: false },
      { file: '.travis.yml', points: 40, label: 'Travis CI', isDir: false },
      { file: 'Jenkinsfile', points: 40, label: 'Jenkins', isDir: false },
      { file: '.github/dependabot.yml', points: 10, label: 'Dependabot', isDir: false },
    ];

    for (const ci of ciPaths) {
      if (ci.isDir) {
        const full = path.join(process.cwd(), ci.file);
        const exists = fs.existsSync(full) && fs.statSync(full).isDirectory();
        if (exists) {
          // Only count the workflow directory if it actually contains workflow files.
          const hasWorkflow = fs
            .readdirSync(full)
            .some((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
          if (hasWorkflow) {
            score += ci.points;
            report += `${ci.label}: detected.\n`;
          }
        }
      } else if (fileExists(ci.file) && !fs.statSync(path.join(process.cwd(), ci.file)).isDirectory()) {
        score += ci.points;
        report += `${ci.label}: detected.\n`;
      }
    }

    // Check if CI runs tests, lint, typecheck, and security audit
    const workflowDir = path.join(process.cwd(), '.github', 'workflows');
    if (fs.existsSync(workflowDir)) {
      const files = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      let hasTest = false;
      let hasLint = false;
      let hasTypecheck = false;
      let hasSecurityAudit = false;
      // Word-boundary regexes so "latest"/"protect" don't count as "test", etc.
      const hasWord = (content: string, token: string) => new RegExp(`\\b${token.replace('-', '\\-')}\\b`, 'i').test(content);
      for (const file of files) {
        const content = fs.readFileSync(path.join(workflowDir, file), 'utf-8');
        if (['test', 'vitest', 'jest'].some((t) => hasWord(content, t))) hasTest = true;
        if (['lint', 'eslint'].some((t) => hasWord(content, t))) hasLint = true;
        if (['typecheck', 'tsc'].some((t) => hasWord(content, t)) || /type-check/i.test(content)) hasTypecheck = true;
        if (['audit', 'snyk', 'codeql', 'gitleaks'].some((t) => hasWord(content, t)) || /npm.*audit/i.test(content)) hasSecurityAudit = true;
      }
      if (hasTest) { score += 10; report += 'CI runs tests.\n'; }
      if (hasLint) { score += 10; report += 'CI runs linting.\n'; }
      if (hasTypecheck) { score += 10; report += 'CI runs type checking.\n'; }
      if (hasSecurityAudit) { score += 10; report += 'CI runs security audit.\n'; }
    }

    if (score === 0) {
      return { score: 0, rawOutput: 'No CI/CD pipeline detected. Consider adding GitHub Actions.' };
    }

    if (score > 100) score = 100;
    return { score, rawOutput: report };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking CI: ${getErrorMessage(err)}` };
  }
}

export function getFeatureFlagsScore(): DimensionScore {
  try {
    let score = 0;
    let report = '';

    if (fileExists('flags.json')) {
      score += 30;
      report += 'flags.json found.\n';

      try {
        const flagsData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'flags.json'), 'utf-8'));
        // flags.json structure: { flags: { flagName: { ... } }, ... }
        const flags = flagsData.flags || flagsData;
        const flagCount = Object.keys(flags).length;
        if (flagCount > 0) {
          score += 20;
          report += `${flagCount} feature flag(s) configured.\n`;
        } else {
          report += 'flags.json exists but has no flags defined.\n';
        }

        // Check if flags are used in code
        const srcDirs = ['src', 'cli', 'lib'];
        let flagRefs = 0;
        for (const dir of srcDirs) {
          const fullDir = path.join(process.cwd(), dir);
          if (!fs.existsSync(fullDir)) continue;
          const scanCode = (d: string) => {
            if (!fs.existsSync(d)) return;
            const entries = fs.readdirSync(d);
            for (const entry of entries) {
              const fp = path.join(d, entry);
              if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
                scanCode(fp);
              } else if (fp.endsWith('.ts') || fp.endsWith('.js') || fp.endsWith('.tsx') || fp.endsWith('.jsx')) {
                const content = fs.readFileSync(fp, 'utf-8');
                for (const flag of Object.keys(flags)) {
                  if (content.includes(flag)) flagRefs++;
                }
              }
            }
          };
          scanCode(fullDir);
        }

        if (flagRefs > 0) {
          score += 25;
          report += `Flags referenced in ${flagRefs} source location(s).\n`;
        } else {
          report += 'Flags defined but not referenced in source code.\n';
        }
      } catch {
        report += 'flags.json exists but could not be parsed.\n';
      }
    } else {
      report += 'No flags.json found. Feature flags are recommended for safe deployments.\n';
    }

    // Check for feature flag references in code even without flags.json
    const envFiles = ['.env', '.env.local', '.env.production'];
    let hasFlagEnv = false;
    for (const f of envFiles) {
      if (fileExists(f)) {
        const content = fs.readFileSync(path.join(process.cwd(), f), 'utf-8');
        if (/FLAG|FEATURE|LAUNCHDARKLY|STATSIG|GROWTHBOOK/i.test(content)) {
          hasFlagEnv = true;
          break;
        }
      }
    }
    if (hasFlagEnv) {
      score += 15;
      report += 'Feature flag env vars detected.\n';
    }

    // Bonus for rollout strategy docs
    if (fileExists('ROLLOUT.md') || fileExists('rollout.md')) {
      score += 15;
      report += 'Rollout strategy documented.\n';
    } else {
      report += 'No ROLLOUT.md found. Document your rollout strategy.\n';
    }

    if (score > 100) score = 100;
    return { score, rawOutput: report || 'No feature flag setup detected.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking feature flags: ${getErrorMessage(err)}` };
  }
}
