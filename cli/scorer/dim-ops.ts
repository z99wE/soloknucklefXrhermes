import fs from 'fs';
import path from 'path';
import { getErrorMessage, fileExists } from './helpers';
import type { DimensionScore } from './types';
export function getPerformanceScore(): DimensionScore {
  try {
    let score = 100;
    let report = '';

    if (fileExists('package.json')) {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Penalize heavy deps
      const heavyDeps = ['moment', 'lodash', 'underscore', 'jquery'];
      for (const name of heavyDeps) {
        if (deps && deps[name]) {
          score -= 5;
          report += `'${name}' is known to impact bundle size. Consider a lighter alternative.\n`;
        }
      }

      // Check for next/image or image optimization config
      if (fileExists('next.config.js') || fileExists('next.config.mjs') || fileExists('next.config.ts')) {
        report += 'Next.js config detected — image optimization available.\n';
      }

      // Check for bundle analyzer
      if (deps && (deps['webpack-bundle-analyzer'] || deps['@next/bundle-analyzer'])) {
        score += 5;
        report += 'Bundle analyzer is configured.\n';
      }
    }

    // Check for Lighthouse or performance budgets
    const perfFiles = ['lighthouserc.js', 'lighthouserc.json', '.lighthouserc.json', 'performance-budget.json'];
    for (const f of perfFiles) {
      if (fileExists(f)) {
        score += 10;
        report += `Performance config (${f}) found.\n`;
        break;
      }
    }

    if (score > 100) score = 100;
    if (score < 0) score = 0;
    return { score, rawOutput: report || 'No performance issues detected.' };
  } catch (err: unknown) {
    return { score: 70, rawOutput: `Error checking performance: ${getErrorMessage(err)}` };
  }
}

export function getReliabilityScore(): DimensionScore {
  try {
    let score = 100;
    let report = '';

    // Check for error tracking
    const errorTrackingPkgs = ['@sentry/node', '@sentry/browser', '@sentry/react', 'rollbar', 'bugsnag', '@datadog/browser-rum'];
    const pkgPath = path.join(process.cwd(), 'package.json');
    let hasErrorTracking = false;
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const p of errorTrackingPkgs) {
        if (allDeps && allDeps[p]) {
          hasErrorTracking = true;
          break;
        }
      }
    }
    if (hasErrorTracking) {
      score += 5;
      report += 'Error tracking service detected.\n';
    } else {
      score -= 10;
      report += 'No error tracking service (Sentry, Rollbar, etc.) detected.\n';
    }

    // Check for retry/timeout patterns in source
    const srcDirs = ['src', 'cli', 'lib', 'api'];
    let retryCount = 0;
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
          } else if (fp.endsWith('.ts') || fp.endsWith('.js')) {
            const content = fs.readFileSync(fp, 'utf-8');
            if (/retry|backoff|exponential/i.test(content)) retryCount++;
          }
        }
      };
      scanCode(fullDir);
    }

    if (retryCount > 0) {
      score += 5;
      report += `Retry/backoff logic found in ${retryCount} file(s).\n`;
    } else {
      score -= 5;
      report += 'No retry/backoff patterns found — transient failures may propagate.\n';
    }

    // Check for health check endpoint
    let hasHealthCheck = false;
    for (const dir of srcDirs) {
      const fullDir = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullDir)) continue;
      const scanCode = (d: string) => {
        if (!fs.existsSync(d) || hasHealthCheck) return;
        const entries = fs.readdirSync(d);
        for (const entry of entries) {
          const fp = path.join(d, entry);
          if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
            scanCode(fp);
          } else if (fp.endsWith('.ts') || fp.endsWith('.js')) {
            const content = fs.readFileSync(fp, 'utf-8');
            if (/\/health|\/healthz|\/ready|\/readiness/i.test(content)) hasHealthCheck = true;
          }
        }
      };
      scanCode(fullDir);
    }

    if (hasHealthCheck) {
      score += 10;
      report += 'Health check endpoint detected.\n';
    } else {
      score -= 5;
      report += 'No health check endpoint found.\n';
    }

    if (score > 100) score = 100;
    if (score < 0) score = 0;
    return { score, rawOutput: report || 'Reliability checks passed.' };
  } catch (err: unknown) {
    return { score: 70, rawOutput: `Error checking reliability: ${getErrorMessage(err)}` };
  }
}

export function getSupplyChainScore(): DimensionScore {
  try {
    // Start from 0 and build up from verifiable, positive evidence. Starting at
    // 50 let a project with NO supply-chain hygiene (no lockfile, no update bot,
    // no pinning) still clear the gate.
    let score = 0;
    let report = '';

    // Lock file integrity
    const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const hasLockFile = lockFiles.some(f => fileExists(f));
    if (hasLockFile) {
      score += 20;
      report += 'Lock file present — installs are reproducible.\n';
    } else {
      report += 'No lock file — supply chain integrity is weakened.\n';
    }

    // Check for .npmrc or registry config
    if (fileExists('.npmrc')) {
      score += 10;
      report += '.npmrc detected — custom registry config present.\n';
    }

    // Check for Dependabot / Renovate
    if (fileExists('.github/dependabot.yml') || fileExists('.github/dependabot.yaml') || fileExists('renovate.json') || fileExists('.renovaterc') || fileExists('.renovaterc.json')) {
      score += 15;
      report += 'Dependency update bot (Dependabot/Renovate) configured.\n';
    } else {
      report += 'No dependency update bot detected.\n';
    }

    // Check for SBOM generation capability
    if (fileExists('cli/sbom.ts') || fileExists('sbom.json') || fileExists('.sbom.json')) {
      score += 10;
      report += 'SBOM generation available.\n';
    }

    // Check for security policy
    if (fileExists('SECURITY.md')) {
      score += 5;
      report += 'Security policy present.\n';
    }

    // Check for npm audit signatures awareness / provenance
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.publishConfig && pkg.publishConfig.access) {
          score += 5;
          report += 'Publish config with access controls present.\n';
        }
      }
    } catch {
      // skip
    }

    // Check for pinned versions in package.json
    if (fileExists('package.json')) {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps) {
        const deps = Object.entries(allDeps) as [string, string][];
        const pinnedCount = deps.filter(([, v]) => !v.startsWith('^') && !v.startsWith('~') && !v.startsWith('>') && v !== '*').length;
        const ratio = deps.length > 0 ? pinnedCount / deps.length : 0;
        if (ratio > 0.8) {
          score += 10;
          report += `Good version pinning (${pinnedCount}/${deps.length} deps pinned).\n`;
        } else if (ratio > 0.5) {
          score += 5;
          report += `Moderate version pinning (${pinnedCount}/${deps.length} deps pinned).\n`;
        } else {
          report += `Low version pinning (${pinnedCount}/${deps.length} deps pinned). Consider pinning more deps.\n`;
        }
      }
    }

    if (score > 100) score = 100;
    if (score < 0) score = 0;
    return { score, rawOutput: report || 'Supply chain checks passed.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking supply chain: ${getErrorMessage(err)}` };
  }
}
