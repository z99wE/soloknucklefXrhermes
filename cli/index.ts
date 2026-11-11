#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { scanSecrets, interceptCommand, calculateHealth, getGitDiff } from './core';
import { getVersion } from './version';
import { printBanner } from './banner';

// Deliberately no dotenv. The engine reads no configuration, and loading a
// checked-out `.env` would inject its variables into the `npm run lint` /
// `npm test` subprocesses that `check` spawns — which is a code-execution
// vector in any repository you just cloned.

const program = new Command();

program
  .name('soloknuckle')
  .description('Production hygiene for solo developers: secrets, firewall, health')
  .version(getVersion());

// Default action: show usage
if (process.argv.length <= 2) {
  printBanner();
  console.log(chalk.cyan.bold('\nSoloknuckle - Production Hygiene CLI\n'));
  console.log(chalk.white('Usage: npx soloknuckle <command> [options]\n'));
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  init        scaffold AGENTS.md, git hooks'));
  console.log(chalk.dim('  check       run health check (lint, tests, secrets, deps)'));
  console.log(chalk.dim('  secrets     scan git diff for secrets'));
  console.log(chalk.dim('  intercept   evaluate shell command safety\n'));
  console.log(chalk.dim('Run `npx soloknuckle <command> --help` for details.'));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

const HOOK_MARKER = 'installed by `soloknuckle init`';

const AGENTS_MD = `# Production Hygiene Rules

1. Run \`soloknuckle check\` before committing.
2. Run \`soloknuckle secrets\` to scan for leaked credentials.
3. Run \`soloknuckle intercept <cmd>\` before destructive commands.
4. No secrets in code. No raw SQL. No eval.
5. Never hardcode a key to "test it quickly". Use an env var and a fixture.
`;

type HookName = 'pre-commit' | 'pre-push' | 'commit-msg';

/**
 * A git hook that runs Soloknuckle checks and then chains any hook that was
 * already installed, so `soloknuckle init` never silently deletes existing
 * automation.
 */
function hookBody(name: HookName): string {
  const common = `#!/usr/bin/env bash
# ${HOOK_MARKER}. Delete this file to uninstall.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
chain_local() {
  if [ -x "$here/${name}.local" ]; then
    "$here/${name}.local" "$@" || exit 1
  fi
}
`;

  if (name === 'commit-msg') {
    return `${common}
# Conventional Commits: <type>(<scope>): <subject>
msg_file="\${1:-}"
if [ -n "$msg_file" ] && [ -f "$msg_file" ]; then
  first_line="$(head -n 1 "$msg_file")"
  case "$first_line" in
    Merge*|Revert*) ;;
    *)
      if ! printf '%s' "$first_line" | grep -qE '^(feat|fix|refactor|chore|docs|test|perf|security|style|build|ci)(\\([a-z0-9.,/_-]+\\))?(!)?: .+'; then
        echo "soloknuckle: commit message must follow Conventional Commits:" >&2
        echo "  <type>(<scope>): <subject>" >&2
        echo "  got: $first_line" >&2
        exit 1
      fi
      ;;
  esac
fi

chain_local "$@"
`;
  }

  const runCheck =
    name === 'pre-commit'
      ? 'run_soloknuckle secrets || exit 1'
      : 'run_soloknuckle check || { echo "soloknuckle: pre-push check failed (see issues above)"; exit 1; }';

  return `${common}
run_soloknuckle() {
  if command -v soloknuckle >/dev/null 2>&1; then
    soloknuckle "$@"
  elif command -v npx >/dev/null 2>&1; then
    npx --no-install soloknuckle "$@"
  else
    return 0
  fi
}

${runCheck}

chain_local "$@"
`;
}

/** Installs one hook, preserving whatever was there before as `<hook>.local`. */
function installHook(hooksDir: string, name: HookName): string {
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
        fs.chmodSync(localPath, '755');
        note = `preserved your existing ${name} as ${name}.local`;
      }
    }
  }

  fs.writeFileSync(hookPath, hookBody(name));
  fs.chmodSync(hookPath, '755');
  return note;
}

program
  .command('init')
  .description('Scaffold AGENTS.md and git hooks (pre-commit, commit-msg, pre-push; never overwrites yours)')
  .action(() => {
    printBanner();
    console.log(chalk.green('Initializing Soloknuckle...'));
    const target = process.cwd();

    const agentsMdPath = path.join(target, 'AGENTS.md');
    if (!fs.existsSync(agentsMdPath)) {
      fs.writeFileSync(agentsMdPath, AGENTS_MD);
      console.log(chalk.green('  created AGENTS.md'));
    } else {
      console.log(chalk.dim('  AGENTS.md already exists, left untouched'));
    }

    const gitDir = path.join(target, '.git');
    if (fs.existsSync(gitDir)) {
      const hooksDir = path.join(gitDir, 'hooks');
      if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

      for (const name of ['pre-commit', 'commit-msg', 'pre-push'] as const) {
        const note = installHook(hooksDir, name);
        console.log(chalk.green(`  installed ${name} hook`));
        if (note) console.log(chalk.dim(`    ${note}`));
      }
    } else {
      console.log(chalk.yellow('  no .git directory, skipped git hooks'));
    }

    console.log(chalk.cyan('\nDone. Next: `npx soloknuckle check`'));
  });

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------
program
  .command('check')
  .description('Run health check (lint, tests, secrets, deps)')
  .option('--min-score <number>', 'exit non-zero below this score', '70')
  .action((options: { minScore: string }) => {
    console.log(chalk.magenta('Calculating project health...'));
    const result = calculateHealth();
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

    const minimum = Number.parseInt(options.minScore, 10);
    if (!Number.isFinite(minimum)) {
      console.log(chalk.red(`  Invalid --min-score: ${options.minScore}`));
      process.exit(2);
    }
    if (result.score < minimum) process.exit(1);
  });

// ---------------------------------------------------------------------------
// secrets
// ---------------------------------------------------------------------------
program
  .command('secrets [diff]')
  .description('Scan git diff for secrets')
  .action((diff?: string) => {
    const diffToScan = diff || getGitDiff();
    const result = scanSecrets(diffToScan);
    if (result.clean) {
      console.log(chalk.green('No secrets detected'));
    } else {
      console.log(chalk.red(`${result.violations.length} violation(s) found:`));
      for (const v of result.violations) {
        console.log(chalk.red(`  -> ${v}`));
      }
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// intercept
// ---------------------------------------------------------------------------
program
  .command('intercept <command...>')
  .description('Evaluate shell command safety')
  .allowUnknownOption(true)
  .action((commandParts: string[]) => {
    const cmd = commandParts.join(' ');
    const result = interceptCommand(cmd);
    if (result.blocked) {
      console.log(chalk.red(`Blocked: ${result.reason}`));
      process.exit(1);
    }
    if (result.suggestion) {
      console.log(chalk.yellow(`Caution: ${result.reason}`));
      console.log(chalk.cyan(`  Suggestion: ${result.suggestion}`));
    } else {
      console.log(chalk.green('Allowed'));
    }
  });

if (process.argv.length > 2) {
  program.parse(process.argv);
}
