import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  printHeader,
  printScoreSummary,
  printCheckSection,
  printSummary,
  buildIssuesFromScores,
  Issue,
} from '../cli/reporter';

describe('reporter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('printHeader', () => {
    it('should print header with Soloknuckle branding', () => {
      printHeader();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Soloknuckle');
      expect(output).toContain('Production Readiness Check');
    });
  });

  describe('printScoreSummary', () => {
    it('should show Production-ready for score >= 90', () => {
      printScoreSummary(95);
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('97/100');
      expect(output).toContain('Production-ready');
    });

    it('should show Almost there for score 70-89', () => {
      printScoreSummary(75);
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('75/100');
      expect(output).toContain('Almost there');
    });

    it('should show Needs work for score 50-69', () => {
      printScoreSummary(55);
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('55/100');
      expect(output).toContain('Needs work');
    });

    it('should show Not ready for score < 50', () => {
      printScoreSummary(30);
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('30/100');
      expect(output).toContain('Not ready');
    });

    it('should include progress bar', () => {
      printScoreSummary(80);
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('\u{2588}');
    });
  });

  describe('printCheckSection', () => {
    it('should show checkmark when no issues', () => {
      printCheckSection('Security', '\u{1F512}', { score: 100, label: 'Security', issues: [] });
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Security');
      expect(output).toContain('100/100');
      expect(output).toContain('\u{2713}');
    });

    it('should show issues with severity icons', () => {
      const issues: Issue[] = [
        { severity: 'critical', category: 'Security', message: 'Secret found', fix: 'Move to .env' },
        { severity: 'warning', category: 'Security', message: 'Weak password', fix: 'Use stronger' },
      ];
      printCheckSection('Security', '\u{1F512}', { score: 30, label: 'Security', issues });
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('\u{1F534}');
      expect(output).toContain('\u{1F7E1}');
      expect(output).toContain('BLOCKER');
      expect(output).toContain('Fix this');
      expect(output).toContain('Secret found');
      expect(output).toContain('Move to .env');
    });

    it('should show file reference when provided', () => {
      const issues: Issue[] = [
        { severity: 'critical', category: 'Security', message: 'Secret found', file: 'config.ts', line: 42 },
      ];
      printCheckSection('Security', '\u{1F512}', { score: 30, label: 'Security', issues });
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('config.ts:42');
    });
  });

  describe('printSummary', () => {
    it('should show All clear when no issues', () => {
      printSummary(90, []);
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('All clear');
      expect(output).toContain('ready to ship');
    });

    it('should show blocker count when critical issues exist', () => {
      const issues: Issue[] = [
        { severity: 'critical', category: 'Security', message: 'Secret found' },
        { severity: 'critical', category: 'Security', message: 'Another secret' },
      ];
      printSummary(50, issues);
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('2 blockers');
      expect(output).toContain('fix before shipping');
    });

    it('should show warning count when warnings exist', () => {
      const issues: Issue[] = [
        { severity: 'warning', category: 'Testing', message: 'No tests' },
      ];
      printSummary(70, issues);
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('1 warning');
      expect(output).toContain('recommended to fix');
    });

    it('should suggest --fix flag when issues exist', () => {
      const issues: Issue[] = [
        { severity: 'warning', category: 'Testing', message: 'No tests' },
      ];
      printSummary(70, issues);
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('--fix');
    });
  });

  describe('buildIssuesFromScores', () => {
    it('should return empty array when all scores are high', () => {
      const issues = buildIssuesFromScores({
        secrets: 100,
        a11y: 100,
        testing: 100,
        dependencies: 100,
        featureFlags: 100,
        ci: 100,
        docs: 100,
        git: 100,
      });
      expect(issues).toHaveLength(0);
    });

    it('should return critical issue for low secrets score', () => {
      const issues = buildIssuesFromScores({ secrets: 30, a11y: 100, testing: 100, dependencies: 100, featureFlags: 100, ci: 100, docs: 100, git: 100 });
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('critical');
      expect(issues[0].message).toContain('secrets');
    });

    it('should return warning for low a11y score', () => {
      const issues = buildIssuesFromScores({ secrets: 100, a11y: 50, testing: 100, dependencies: 100, featureFlags: 100, ci: 100, docs: 100, git: 100 });
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toContain('accessibility');
    });

    it('should return warning for low testing score', () => {
      const issues = buildIssuesFromScores({ secrets: 100, a11y: 100, testing: 30, dependencies: 100, featureFlags: 100, ci: 100, docs: 100, git: 100 });
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toContain('tests');
    });

    it('should return multiple issues for multiple low scores', () => {
      const issues = buildIssuesFromScores({
        secrets: 30,
        a11y: 50,
        testing: 30,
        dependencies: 50,
        featureFlags: 30,
        ci: 30,
        docs: 20,
        git: 40,
      });
      expect(issues.length).toBeGreaterThanOrEqual(5);
    });
  });
});
