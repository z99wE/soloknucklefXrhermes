export const HOOK_MARKER = 'soloknuckle-hook';

export type HookName = 'pre-commit' | 'pre-push' | 'commit-msg';

function commonHeader(name: HookName): string {
  return `#!/usr/bin/env bash
# ${HOOK_MARKER}. Delete this file to uninstall.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
chain_local() {
  if [ -x "$here/${name}.local" ]; then
    "$here/${name}.local" "$@" || exit 1
  fi
}
`;
}

/**
 * Managed hook bodies installed by \`soloknuckle init\`. This is the single
 * source of truth for user-project hooks (kept distinct from the repository's
 * own maintainer gates in git-hooks/*).
 */
export function hookBody(name: HookName): string {
  const common = commonHeader(name);

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
