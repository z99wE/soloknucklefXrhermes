#!/bin/bash
# Soloknuckle Deep Wipe — removes all soloknuckle traces from Hermes
# Usage: bash scripts/wipe.sh
# Safe to run multiple times. Does NOT touch source code.
# Tested on macOS (zsh) and Linux (bash).

set -e

HERMES_HOME="${HOME}/.hermes"

echo "=== Soloknuckle Deep Wipe ==="
echo ""

# Step 1: Stop Hermes if running
echo "Step 1: Stopping Hermes (if running)..."
if pgrep -f "hermes" > /dev/null 2>&1; then
    pkill -f "hermes" 2>/dev/null || true
    sleep 2
    echo "Stopped Hermes."
else
    echo "Hermes not running."
fi
echo ""

# Step 2: Remove soloknuckle traces
echo "Step 2: Removing soloknuckle traces..."

# Main database and related files
for f in \
    "$HERMES_HOME/state.db" \
    "$HERMES_HOME/state.db-shm" \
    "$HERMES_HOME/state.db-wal" \
    "$HERMES_HOME/state.db.fts_rebuild.lock" \
    "$HERMES_HOME/state.db.quarantine.lock"; do
    if [ -e "$f" ]; then
        rm -f "$f"
        echo "  Removed: $f"
    fi
done

# Backup config files (pattern match)
for f in "$HERMES_HOME"/.env.bak-* "$HERMES_HOME"/config.yaml.bak-*; do
    if [ -e "$f" ]; then
        rm -f "$f"
        echo "  Removed: $f"
    fi
done

# Directories to remove
for d in \
    "$HERMES_HOME/memories" \
    "$HERMES_HOME/pending" \
    "$HERMES_HOME/pending_messages" \
    "$HERMES_HOME/plugin-data" \
    "$HERMES_HOME/plugin-update-checks" \
    "$HERMES_HOME/.curator_backups" \
    "$HERMES_HOME/backups" \
    "$HERMES_HOME/cache/scratch" \
    "$HERMES_HOME/logs"; do
    if [ -d "$d" ]; then
        rm -rf "$d"
        echo "  Removed: $d"
    fi
done

# Soloknuckle-specific state directory
if [ -d "$HOME/.soloknuckle" ]; then
    rm -rf "$HOME/.soloknuckle"
    echo "  Removed: $HOME/.soloknuckle"
fi

echo "Done."
echo ""

# Step 3: Verify
echo "Step 3: Verifying cleanup..."
REMAINING=$(grep -rni "soloknuckle" "$HERMES_HOME" 2>/dev/null | grep -v "sessions/" | grep -v "memory" | wc -l | tr -d ' ')
if [ "$REMAINING" -eq 0 ]; then
    echo "OK: No soloknuckle traces found (excluding agent session history)."
else
    echo "WARNING: Found $REMAINING remaining references (likely agent session history)."
    echo "   These are Hermes agent logs, not soloknuckle installation traces."
fi
echo ""

# Step 4: Restart Hermes
echo "Step 4: Restarting Hermes..."
if command -v hermes >/dev/null 2>&1; then
    nohup hermes > /dev/null 2>&1 &
    echo "OK: Hermes restarted."
else
    echo "WARNING: Hermes not found in PATH. Start it manually."
fi
echo ""

echo "=== Deep Wipe Complete ==="
echo "Source code was NOT touched."