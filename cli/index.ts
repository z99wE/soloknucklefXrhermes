import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { scanSecrets, interceptCommand, calculateHealth, getGitDiff } from './core';
import { getVersion } from './path-utils';
import { printBanner } from './banner';

dotenv.config({ quiet: true });

const program = new Command();

program
  .name('soloknuckle')
  .description('Production hygiene for solo developers — secrets, firewall, health')
  .version(getVersion());

// Default action: show usage
if (process.argv.length <= 2) {
  printBanner();
  console.log(chalk.cyan.bold('\n🛡️  Soloknuckle — Production Hygiene CLI\n'));
  console.log(chalk.white('Usage: npx soloknuckle <command> [options]\n'));
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  init        — scaffold AGENTS.md, git hooks'));
  console.log(chalk.dim('  check       — run health check (lint, tests, secrets, deps)'));
  console.log(chalk.dim('  secrets     — scan git diff for secrets'));
  console.log(chalk.dim('  intercept   — evaluate shell command safety\n'));
  console.log(chalk.dim('Run `npx soloknuckle <command> --help` for details.'));
  process.exit(0);
}

// init
program
  .command('init')
  .description('Scaffold AGENTS.md and git hooks')
  .action(() => {
    printBanner();
    console.log(chalk.green('🚀 Initializing Soloknuckle...'));
    const target = process.cwd();

    // AGENTS.md
    const agentsMdPath = path.join(target, 'AGENTS.md');
    if (!fs.existsSync(agentsMdPath)) {
      fs.writeFileSync(agentsMdPath, `# Production Hygiene Rules

1. Run \`soloknuckle check\` before committing.
2. Run \`soloknuckle secrets\` to scan for leaked credentials.
3. Run \`soloknuckle intercept <cmd>\` before destructive commands.
4. No secrets in code. No raw SQL. No eval.
`);
      console.log(chalk.green('✅ Created AGENTS.md'));
    }

    // Git hooks
    const hooksDir = path.join(target, '.git', 'hooks');
    if (fs.existsSync(path.join(target, '.git'))) {
      if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

      const preCommitPath = path.join(hooksDir, 'pre-commit');
      fs.writeFileSync(preCommitPath, `#!/usr/bin/env bash
echo "🛡️ Running Soloknuckle pre-commit checks..."
soloknuckle secrets "" || exit 1
echo "✅ Pre-commit passed"
`);
      fs.chmodSync(preCommitPath, '755');

      const prePushPath = path.join(hooksDir, 'pre-push');
      fs.writeFileSync(prePushPath, `#!/usr/bin/env bash
echo "🛡️ Running Soloknuckle pre-push check..."
soloknuckle check || echo "⚠️ Health check issues (use --force to override)"
`);
      fs.chmodSync(prePushPath, '755');

      console.log(chalk.green('✅ Installed git pre-commit and pre-push hooks'));
    } else {
      console.log(chalk.yellow('⚠️ No .git directory — skipped git hook installation.'));
    }

    console.log(chalk.cyan('✨ Initialization complete.'));
  });

// check
program
  .command('check')
  .description('Run health check (lint, tests, secrets, deps)')
  .action(() => {
    console.log(chalk.magenta('🔍 Calculating project health...'));
    const result = calculateHealth();
    const color = result.score >= 80 ? chalk.green : result.score >= 50 ? chalk.yellow : chalk.red;
    console.log(`\n  Score: ${color(result.score + '/100')}  ${chalk.dim(result.grade)}`);
    if (result.issues.length > 0) {
      console.log('\n  Issues:');
      for (const issue of result.issues) {
        console.log(chalk.red(`    → ${issue}`));
      }
    } else {
      console.log(chalk.green('\n  ✅ No issues found'));
    }
    console.log('');
  });

// secrets
program
  .command('secrets [diff]')
  .description('Scan git diff for secrets')
  .action((diff?: string) => {
    const diffToScan = diff || getGitDiff();
    const result = scanSecrets(diffToScan);
    if (result.clean) {
      console.log(chalk.green('✅ No secrets detected'));
    } else {
      console.log(chalk.red(`❌ ${result.violations.length} violation(s) found:`));
      for (const v of result.violations) {
        console.log(chalk.red(`  → ${v}`));
      }
      process.exit(1);
    }
  });

// intercept
program
  .command('intercept <command...>')
  .description('Evaluate shell command safety')
  .action((commandParts: string[]) => {
    const cmd = commandParts.join(' ');
    const result = interceptCommand(cmd);
    if (result.blocked) {
      console.log(chalk.red(`❌ Blocked: ${result.reason}`));
      process.exit(1);
    }
    if (result.suggestion) {
      console.log(chalk.yellow(`⚠️  ${result.reason}`));
      console.log(chalk.cyan(`   Suggestion: ${result.suggestion}`));
    } else {
      console.log(chalk.green('✅ Allowed'));
    }
  });

if (process.argv.length > 2) {
  program.parse(process.argv);
}