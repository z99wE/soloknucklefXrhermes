#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { scanSecrets, interceptCommand, calculateHealth, getGitDiff } from './core';
import { getVersion } from './version';
import { printBanner } from './banner';
import { HOOK_MARKER, hookBody, type HookName } from './initHooks';

export { HOOK_MARKER, hookBody, type HookName };

// Deliberately no dotenv. The engine reads no configuration, and loading a
// checked-out `.env` would inject its variables into the `npm run lint` /
// `npm test` subprocesses that `check` spawns — which is a code-execution
// vector in any repository you just cloned.

const program = new Command();

program
  .name('soloknuckle')
  .description('Production hygiene for solo developers: secrets, firewall, health')
  .version(getVersion());

function showUsage(): void {
  printBanner();
  console.log(chalk.cyan.bold('\nSoloknuckle - Production Hygiene CLI\n'));
  console.log(chalk.white('Usage: npx soloknuckle <command> [options]\n'));
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  init        scaffold AGENTS.md, git hooks'));
  console.log(chalk.dim('  check       run health check (lint, tests, secrets, deps)'));
  console.log(chalk.dim('  secrets     scan git diff for secrets'));
  console.log(chalk.dim('  intercept   evaluate shell command safety\n'));
  console.log(chalk.dim('Run `npx soloknuckle <command> --help` for details.'));
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

const AGENTS_TEMPLATE = `# AGENTS.md - Project Guidelines

## Overview
This project uses [Soloknuckle](https://github.com/z99wE/soloknucklefXrhermes) for production hygiene.

## Commands
- \`soloknuckle check\` - Health score and actionable issues
- \`soloknuckle secrets\` - Scan for secrets in the working diff
- \`soloknuckle intercept "<command>"\` - Check if a command is safe

## Rules
- No secrets or credentials in source control
- Run \`soloknuckle check\` before every commit
- Never force-push to main
`;

/** Installs one hook, preserving whatever was there before as `<hook>.local`. */
export function installHook(hooksDir: string, name: HookName): string {
  const hookPath = path.join(hooksDir, name);
  const localPath = path.join(hooksDir, `${name}.local`);
  let note = '';

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    const ours = existing.includes(HOOK_MARKER);
    if (!ours) {
      if (fs.existsSync(localPath)) {
        note = `kept existing ${name} (chain target ${name}.local already exists)`;
      } else {
        fs.renameSync(hookPath, localPath);
        try { fs.chmodSync(localPath, 0o755); } catch { /* ignore */ }
        note = `preserved your existing ${name} as ${name}.local`;
      }
    }
  }

  fs.writeFileSync(hookPath, hookBody(name));
  fs.chmodSync(hookPath, 0o755);
  return note;
}

export function runInit(cwd: string = process.cwd()): { createdAgents: boolean; hooks: Record<HookName, string | null>; inGitRepo: boolean } {
  const hooks: Record<HookName, string | null> = { 'pre-commit': null, 'commit-msg': null, 'pre-push': null };
  const inGitRepo = fs.existsSync(path.join(cwd, '.git'));
  const agentsPath = path.join(cwd, 'AGENTS.md');
  let createdAgents = false;
  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, AGENTS_TEMPLATE, 'utf-8');
    createdAgents = true;
  }
  if (!inGitRepo) {
    return { createdAgents, hooks, inGitRepo };
  }
  const hooksDir = path.join(cwd, '.git', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  for (const name of ['pre-commit', 'commit-msg', 'pre-push'] as const) {
    hooks[name] = installHook(hooksDir, name);
  }
  return { createdAgents, hooks, inGitRepo };
}

export function cmdInit(cwd: string = process.cwd()): number {
  printBanner();
  console.log(chalk.green('Initializing Soloknuckle...'));
  const res = runInit(cwd);
  if (res.createdAgents) console.log(chalk.green('  created AGENTS.md'));
  else console.log(chalk.dim('  AGENTS.md already exists, left untouched'));

  if (!res.inGitRepo) {
    console.log(chalk.yellow('  no .git directory, skipped git hooks'));
  } else {
    for (const name of ['pre-commit', 'commit-msg', 'pre-push'] as const) {
      console.log(chalk.green(`  installed ${name} hook`));
      if (res.hooks[name]) console.log(chalk.dim(`    ${res.hooks[name]}`));
    }
  }
  console.log(chalk.cyan('\nDone. Next: `npx soloknuckle check`'));
  return 0;
}

export function cmdCheck(minScoreRaw: string, cwd: string = process.cwd()): number {
  console.log(chalk.magenta('Calculating project health...'));
  const result = calculateHealth(cwd);
  const color = result.score >= 80 ? chalk.green : result.score >= 50 ? chalk.yellow : chalk.red;
  console.log(`\n  Score: ${color(result.score + '/100')}  ${chalk.dim(result.grade)}`);
  if (result.issues.length > 0) {
    console.log('\n  Issues:');
    for (const issue of result.issues) {
      console.log(chalk.red(`    -> ${issue}`));
    }
  } else {
    console.log(chalk.green('\n  No issues found'));
  }
  console.log('');

  const minimum = Number.parseInt(minScoreRaw, 10);
  if (!Number.isFinite(minimum)) {
    console.log(chalk.red(`  Invalid --min-score: ${minScoreRaw}`));
    return 2;
  }
  return result.score < minimum ? 1 : 0;
}

export function cmdSecrets(diffArg?: string, cwd: string = process.cwd()): number {
  const diffToScan = diffArg || getGitDiff(cwd);
  const result = scanSecrets(diffToScan);
  if (result.clean) {
    console.log(chalk.green('No secrets detected'));
    return 0;
  }
  console.log(chalk.red(`${result.violations.length} violation(s) found:`));
  for (const v of result.violations) {
    console.log(chalk.red(`  -> ${v}`));
  }
  return 1;
}

export function cmdIntercept(commandParts: string[]): number {
  const cmd = commandParts.join(' ');
  const result = interceptCommand(cmd);
  if (result.blocked) {
    console.log(chalk.red(`Blocked: ${result.reason}`));
    return 1;
  }
  if (result.suggestion) {
    console.log(chalk.yellow(`Caution: ${result.reason}`));
    console.log(chalk.cyan(`  Suggestion: ${result.suggestion}`));
    return 0;
  }
  console.log(chalk.green('Allowed'));
  return 0;
}

program
  .command('init')
  .description('Scaffold AGENTS.md and git hooks (pre-commit, commit-msg, pre-push; never overwrites yours)')
  .action(() => {
    process.exit(cmdInit());
  });

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------
program
  .command('check')
  .description('Run health check (lint, tests, secrets, deps)')
  .option('--min-score <number>', 'exit non-zero below this score', '70')
  .action((options: { minScore: string }) => {
    process.exit(cmdCheck(options.minScore));
  });

// ---------------------------------------------------------------------------
// secrets
// ---------------------------------------------------------------------------
program
  .command('secrets [diff]')
  .description('Scan git diff for secrets')
  .action((diff?: string) => {
    process.exit(cmdSecrets(diff));
  });

// ---------------------------------------------------------------------------
// intercept
// ---------------------------------------------------------------------------
program
  .command('intercept <command...>')
  .description('Evaluate shell command safety')
  .allowUnknownOption(true)
  .action((commandParts: string[]) => {
    process.exit(cmdIntercept(commandParts));
  });

export function main(argv = process.argv, exit: (code: number) => never | void = (code) => process.exit(code)): void {
  if (argv.length <= 2) {
    showUsage();
    exit(0);
    return;
  }
  program.parse(argv);
}

if (require.main === module) {
  main();
}
