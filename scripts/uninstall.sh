#!/usr/bin/env bash
# Soloknuckle uninstaller — removes Soloknuckle's own files and nothing else.
#
# Usage: bash scripts/uninstall.sh
#
# Scope, deliberately narrow:
#   - the Hermes plugin directory
#   - Soloknuckle's plugin data
#   - ~/.soloknuckle
#
# It does NOT stop Hermes, does NOT touch ~/.hermes/state.db, memories, logs,
# backups, or any other application's data, and does NOT restart anything.

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
PLUGIN_DIR="$HERMES_HOME/plugins/soloknuckle"
PLUGIN_DATA="$HERMES_HOME/plugin-data/soloknuckle"
USER_STATE="$HOME/.soloknuckle"

echo "Soloknuckle uninstall"
echo ""

removed=0
for target in "$PLUGIN_DIR" "$PLUGIN_DATA" "$USER_STATE"; do
  if [ -e "$target" ]; then
    rm -rf -- "$target"
    echo "  removed  $target"
    removed=$((removed + 1))
  else
    echo "  absent   $target"
  fi
done

echo ""
echo "Removed $removed path(s)."

if command -v soloknuckle >/dev/null 2>&1; then
  echo ""
  echo "The 'soloknuckle' command is still on your PATH. If you installed it with npm:"
  echo "  npm uninstall -g soloknuckle"
fi

echo ""
echo "Git hooks installed by 'soloknuckle init' live in your project's .git/hooks."
echo "Delete .git/hooks/pre-commit and .git/hooks/pre-push (or the lines mentioning"
echo "soloknuckle) in each project. Any hook that was there before is preserved as"
echo "pre-commit.local / pre-push.local and can be renamed back."
echo ""
echo "Nothing else was touched. Hermes is still running; restart it to unload the plugin."
