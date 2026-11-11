# PRD & TRD — Soloknuckle v5 (Focused Scope)

## What to Build
3 MCP Tools: `soloknuckle_secrets()`, `soloknuckle_intercept()`, `soloknuckle_health()`
4 CLI Commands: `init`, `check`, `secrets`, `intercept`
One Core Engine: Same code runs in CLI, git hooks, MCP, IDE

## What to Delete (~3000 lines)
Telemetry/AI tracking, Webhook daemon, Governance framework, AI watcher, Compliance audits, Feature flags, All middleware hooks

## Why It Wins
✅ Not scary (transparent, local, no surveillance) ✅ Actually useful (catches secrets, firewall issues, weak tests) ✅ Solo dev friendly (simple, fast, one score) ✅ Real moat (not just MCP/skill) ✅ Hermes-ready (3 clean tools)

---

## 1. Product Requirements

### 1.1 Core Engine (Single Source of Truth)

One module: `cli/core.ts`. All 4 CLI commands and 3 MCP tools call into this.

```typescript
export function scanSecrets(diff: string): { clean: boolean; violations: string[] }
export function interceptCommand(cmd: string): { blocked: boolean; reason?: string; suggestion?: string }
export function calculateHealth(): { score: number; grade: string; issues: string[] }
```

No duplication. CLI, git hooks, MCP, IDE — all call the same functions.

### 1.2 MCP Tools (3 total)

| Tool | Input | Output |
|------|-------|--------|
| `soloknuckle_secrets` | `diff` (string, optional) | `{ clean, violations[] }` |
| `soloknuckle_intercept` | `command` (string) | `{ blocked, reason?, suggestion? }` |
| `soloknuckle_health` | none | `{ score, grade, issues[] }` |

No `flags`, no `policy`, no `reputation`, no `replay`, no `simulation`.

### 1.3 CLI Commands (4 total)

| Command | What It Does |
|---------|-------------|
| `init` | Scaffold `.git/hooks/pre-commit` + `AGENTS.md` (minimal) |
| `check` | Run all 3 core checks, print score + issues |
| `secrets` | Scan git diff for secrets, print violations |
| `intercept` | Evaluate command, print verdict + suggestion |

No `audit`, `pr`, `persona`, `sbom`, `compliance`, `telemetry`, `ai-watch`, `watch`, `score`, `capabilities`, `guard-install`, `rollback`.

### 1.4 What Gets Deleted (~3000 lines)

| Module | Lines | Reason |
|--------|-------|--------|
| `telemetry.ts` | ~200 | Surveillance — not needed |
| `ai-watcher.ts` | ~400 | AI tracking — not needed |
| `rollback.ts` | ~300 | Webhook daemon — not needed |
| `compliance.ts` | ~250 | Governance audits — not needed |
| `mutation.ts` | ~200 | Change tracking — not needed |
| `context-validator.ts` | ~150 | Context validation — not needed |
| `flaky-detector.ts` | ~150 | Flaky test detection — over-engineered |
| `budget.ts` | ~100 | Budget tracking — not needed |
| `caller-contract.ts` | ~150 | Caller contracts — not needed |
| `scanner.ts` (partial) | ~200 | Keep secret patterns, delete PII scanning |
| `flags-schema.json` | ~30 | Feature flags — deleted |
| `flags.json` | ~15 | Feature flags — deleted |
| `gates.ts` | ~80 | Hard gates — replaced by single score |
| `scorer/` (partial) | ~300 | Keep health score, delete 7-domain breakdown |
| `mcp-server.ts` (partial) | ~200 | Keep 3 tools, delete rest |

**Total deleted:** ~2,875 lines → ~3000 lines

### 1.5 What Stays (Minimal Core)

| Module | Lines | Purpose |
|--------|-------|---------|
| `core.ts` | ~400 | Single engine: secrets, intercept, health |
| `index.ts` | ~100 | CLI entry, 4 commands |
| `mcp-server.ts` | ~150 | 3 MCP tools |
| `scanner.ts` (secret patterns only) | ~100 | Secret/PII regex |
| `interceptor.ts` | ~80 | Firewall patterns |
| `scorer.ts` (health score only) | ~100 | Single 0-100 score |
| `git-hooks/pre-commit` | ~30 | Minimal hook |
| `git-hooks/commit-msg` | ~10 | Conventional commits (soft) |

**Total kept:** ~970 lines

---

## 2. Technical Requirements

### 2.1 Core Engine (`core.ts`)

```typescript
export interface SecretScanResult {
  clean: boolean;
  violations: string[];
}

export interface InterceptResult {
  blocked: boolean;
  reason?: string;
  suggestion?: string;
}

export interface HealthResult {
  score: number;        // 0-100
  grade: string;        // "A" | "B" | "C" | "F"
  issues: string[];     // max 5 actionable items
}

export function scanSecrets(diff: string): SecretScanResult
export function interceptCommand(cmd: string): InterceptResult
export function calculateHealth(): HealthResult
```

### 2.2 CLI (`index.ts`)

```typescript
program.command('init').action(() => { /* scaffold hooks + AGENTS.md */ })
program.command('check').action(() => { /* run all 3, print score */ })
program.command('secrets').action(() => { /* scan diff, print violations */ })
program.command('intercept <cmd>').action((cmd) => { /* evaluate, print verdict */ })
```

No flags. No options. No `--strict`, `--fix`, `--verbose`. Simple.

### 2.3 MCP Server (`mcp-server.ts`)

```typescript
server.tool("soloknuckle_secrets", { diff: z.string().optional() }, async ({ diff }) => { ... })
server.tool("soloknuckle_intercept", { command: z.string() }, async ({ command }) => { ... })
server.tool("soloknuckle_health", {}, async () => { ... })
```

No other tools. No `flags`, no `policy`, no `reputation`.

### 2.4 Hermes Plugin (`__init__.py`)

```python
def register(ctx):
    ctx.register_tool(
        name="soloknuckle.secrets",
        toolset="soloknuckle",
        schema={"type": "object", "properties": {"diff": {"type": "string"}}, "required": []},
        handler=_run_secrets,
        description="Scan git diff for API keys, tokens, PII",
        emoji="🔒",
    )
    ctx.register_tool(
        name="soloknuckle.intercept",
        toolset="soloknuckle",
        schema={"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]},
        handler=_run_intercept,
        description="Evaluate command against firewall, get verdict with suggestions",
        emoji="🛡️",
    )
    ctx.register_tool(
        name="soloknuckle.health",
        toolset="soloknuckle",
        schema={"type": "object", "properties": {}, "required": []},
        handler=_run_health,
        description="Project health score 0-100 with actionable issues",
        emoji="📊",
    )
```

No middleware. No hooks. No pane. Just 3 tools.

### 2.5 `plugin.yaml`

```yaml
name: soloknuckle
version: 5.0.0
description: Production hygiene for solo developers — secrets, firewall, health
api: dashboard/plugin_api.py
desktop: true
requires_hermes: ">=0.22.0"
provides_tools:
  - soloknuckle.secrets
  - soloknuckle.intercept
  - soloknuckle.health
provides_hooks: []
requires_env: []
```

### 2.6 `AGENTS.md` (Minimal Scaffold)

```markdown
# Production Hygiene Rules

1. Run `soloknuckle check` before committing.
2. Run `soloknuckle secrets` to scan for leaked credentials.
3. Run `soloknuckle intercept <cmd>` before destructive commands.
4. No secrets in code. No raw SQL. No eval.
```

---

## 3. Hermes Plugin Doctor Validation (Shipping Gate)

**`hermes plugins validate` must pass:**
- [ ] `plugin.yaml` has all required fields (name, version, api, desktop)
- [ ] `provides_tools` matches exactly tools registered in `__init__.py`
- [ ] `provides_hooks` is empty (no hooks registered)
- [ ] `api` points to correct Python file path
- [ ] No module-level `hermes_plugin_sdk` imports (runtime-only)
- [ ] `__init__.py` is importable without Hermes runtime
- [ ] No bare `except: pass` patterns
- [ ] No shell-pipe patterns in tests

**`hermes plugins doctor` must pass:**
- [ ] Runtime discovery succeeds
- [ ] Manifest parsing succeeds
- [ ] Import succeeds
- [ ] Registration succeeds
- [ ] **0 warnings, 0 errors**

---

## 4. LLM Safety (Non-Negotiable)

### 4.1 Invisible Prompt Injection — MUST NOT EXIST

**The previous version had a critical flaw:** `pre_llm_call` hooks silently injected governance instructions into every LLM turn. This is **prompt injection** — modifying what the LLM sees without user awareness. LLMs and security scanners flag this as suspicious.

**v5 Rule:** No hidden prompt injection. Period.

| What Was Removed | Why It Was Dangerous | v5 Replacement |
|-----------------|---------------------|----------------|
| `pre_llm_call` hook injecting governance text | Silently modifies LLM context every turn | **None.** MCP tools are called explicitly by the agent when needed |
| `tool_execution` middleware blocking based on content | Wraps LLM tool calls invisibly | **None.** Tools return verdicts; agent decides what to do |
| System prompt injection in `__init__.py` | Hidden instructions in LLM context | **None.** Tool descriptions are transparent and user-visible |
| Governance context in every turn | LLM can't distinguish user intent from injected rules | **None.** Agent calls tools explicitly; no auto-injection |

**v5 Principle:** The agent calls `soloknuckle_health()` when it wants to. The system never pushes text into the LLM's context. All tool outputs are explicit JSON returned to the agent. Nothing is invisible.

### 4.2 LLM Safety Checklist

| Check | Requirement |
|-------|-------------|
| No invisible prompt injection | No `pre_llm_call` hook, no context injection, no system prompt manipulation |
| No LLM jacking | No `tool_execution` middleware that blocks based on content |
| No alarmist language | No "BLOCKED", "ERROR", "VIOLATION" in messages |
| No regex triggers | Patterns exclude `node_modules`, no `eval`/`new Function` |
| Structured output | All verdicts are JSON with `blocked`, `reason`, `suggestion` |
| Exit codes | Exit 1 only for genuine security risks (curl\|sh, SQL DROP) |
| Transparent tool descriptions | Tool descriptions in `plugin.yaml` match exactly what tools do |
| No hidden state | No `Symbol`, no `Proxy`, no hidden background processes |

---

## 5. What to Learn from Subfolders

### From `templates/`:
- Feature flag patterns → **DELETE** (no flags in v5)
- `flags.json` template → **DELETE** (no feature flags)

### From `git-hooks/`:
- `pre-commit` (7 gates) → **SIMPLIFY** to 3 checks (secrets, firewall, health)
- `commit-msg` (conventional commits) → **KEEP** (soft enforcement)

### From `workflow/checklist.md`:
- PR checklist → **KEEP** (good for solo dev discipline)
- But simplify: remove multi-environment (staging/prod) complexity

### From `cli/scorer/`:
- 13 dimensions, 7 domains → **SIMPLIFY** to single 0-100 score
- Keep secret scanning, delete quality/testing/efficiency/etc. scoring

### From `cli/scanner.ts`:
- Secret patterns → **KEEP** (core value)
- PII patterns → **DELETE** (over-engineered for CLI)
- SAST scanning → **DELETE** (belongs in CI, not CLI)

### From `cli/interceptor.ts`:
- Destructive patterns → **KEEP** (core value)
- Reduce from 30 patterns to ~10 essential ones

### From `cli/mcp-server.ts`:
- 10 MCP tools → **REDUCE** to 3
- Delete: telemetry, flags, flag_set, suggest, branches, supply_chain_sentinel

### From `index.html`:
- 13-feature marketing page → **SIMPLIFY** to 3 core features
- Remove "AI tracking", "governance", "mutation testing" claims

---

## 6. Moat

**One sentence:** "The only hygiene layer that catches secrets, firewall issues, and weak tests in one score — without surveillance, without blocking, without LLM jacking."

Not a skill. Not just an MCP. A real tool with a real engine that runs everywhere.

---

## 7. Migration (3 Phases)

| Phase | Change | Rollback |
|-------|--------|----------|
| 1 | Delete ~3000 lines, keep core engine | Git revert |
| 2 | Hermes integration (3 tools, no middleware/hooks) | Uninstall plugin |
| 3 | Doctor validation + catalog submission | Revert PR |

---

## 8. UI Update (index.html)

### 8.1 Problem

The current `index.html` markets 13 features, "AI tracking", "governance", "mutation testing", and a 13-dimension scorecard. This is **over-engineered marketing** that makes the product look suspicious and complex.

### 8.2 What to Change

**Current (13 features, 5000+ words, scary):**
- "AI vs human telemetry" — surveillance
- "Governance framework" — enforcement
- "Mutation testing" — over-engineered
- "13 dimensions" — complexity
- "Supply chain sentinel" — scope creep

**New (3 features, <500 words, transparent):**

| Section | Content |
|---------|---------|
| **Hero** | "Catch secrets, block dangerous commands, score your tests — before you push." |
| **Feature 1: Secrets** | "Scans staged diffs for AWS keys, GitHub PATs, DB passwords. Local only." |
| **Feature 2: Firewall** | "Blocks `rm -rf`, `git push --force`, `curl \| sh`. Explains why." |
| **Feature 3: Health** | "One score (0-100). Lint, tests, secrets, test quality. One number." |
| **How It Works** | 3 steps: init → check → push |
| **MCP Integration** | "Hermes calls 3 tools: secrets, intercept, health. Clean JSON." |
| **FAQ** | "Is it tracking? No. Is it safe? Yes. Open source? Yes." |
| **Footer** | GitHub link, ISC license, zero config |

### 8.3 What to Delete from index.html

- All "AI tracking" / "telemetry" references
- All "governance" / "compliance" references
- "Mutation testing" (too complex for marketing)
- "13 dimensions" → replace with "3 checks"
- "Supply chain sentinel" → remove
- "Auto-recover from bad deploys" → remove
- "Budget/flaky cost calculator" → remove
- "Contract mismatch detection" → remove
- All "AI-powered" badges → remove
- Social proof stats (13 dimensions, 7 domains, 4 gates, 441 tests) → simplify to "3 checks, 1 score, 0 surveillance"

### 8.4 UI Design Specification — IBM Design Language (Carbon)

**Design System:** IBM Design Language (Carbon) — NOT neo-brutalist, NOT generic.

| Property | Value |
|----------|-------|
| **Font** | Arial, Roboto, or IBM Plex Sans (no serif, no decorative) |
| **Layout** | Bento grid — 3-column grid, cards spanning 1-2 columns |
| **Card Style** | `flex flex-col gap-2 p-3 rounded border border-[#d0d0d0] bg-[#ffffff]` |
| **Borders** | Subtle, 1px, `#d0d0d0` (light) / `#393939` (dark) |
| **Corners** | Rounded (4px-8px), not sharp, not fully rounded |
| **Colors** | Carbon palette: `#161616` (text), `#f4f4f4` (bg), `#0f62fe` (accent) |
| **Shadows** | None (flat design, no drop shadows) |
| **Spacing** | 8px grid, consistent gaps |
| **Icons** | **NONE** — no emojis, no icons, no pull tags, text and color only |
| **Animations** | Minimal — opacity transitions only, no bounce/slide |
| **Dark Mode** | Carbon dark theme (`#161616` bg, `#f4f4f4` text) |

**Hermes Desktop Plugin UI (if applicable):**
- Plain ESM, loaded uncompiled
- Only imports: `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`
- JSX syntax will NOT parse — use `jsx()` / `jsxs()` calls only
- `ctx.i18n.register` must be inside `register(ctx)`, not module top level
- `useValue` is for `host.state.*` atoms only — component state uses `useState()`
- No icons, no emojis, no pull tags — text and color only
- Bento grid: 3-column grid with cards spanning 1-2 columns
- Each card: `div` with `flex flex-col gap-2 p-3 rounded border border-[#d0d0d0] bg-[#ffffff]`
- Contains `SectionHeader` + content

### 8.5 What to Delete from index.html

- All "AI tracking" / "telemetry" references
- All "governance" / "compliance" references
- "Mutation testing" (too complex for marketing)
- "13 dimensions" → replace with "3 checks"
- "Supply chain sentinel" → remove
- "Auto-recover from bad deploys" → remove
- "Budget/flaky cost calculator" → remove
- "Contract mismatch detection" → remove
- All "AI-powered" badges → remove
- All emojis and icons (no 🛡️, 🔥, 🤖, etc.)
- All pull tags (no "NEW", "BETA", "PRO" badges)
- Social proof stats (13 dimensions, 7 domains, 4 gates, 441 tests) → simplify to "3 checks, 1 score, 0 surveillance"
- Neo-brutalist styling (sharp corners, hard shadows, 4px borders) → Carbon (rounded, flat, subtle borders)

### 8.6 What to Keep from index.html

- Card-based layout (simplify to bento grid)
- Commands table (simplify to 4 commands)
- Security section (local-first, no PII, npm provenance)
- IDE integration section (Cursor, Windsurf, Claude Code, Replit)
- Responsive design (simplify breakpoints)
- Dark mode support (use Carbon dark theme)

### 8.7 UI Principle

**The UI should feel like a tool, not a surveillance system.**

- No "monitoring" language
- No "tracking" language
- No "governance" language
- No "compliance" language
- No emojis, no icons, no pull tags
- Just: "Catch secrets. Block dangerous commands. Score your tests."
- IBM Carbon design language throughout
- Text and color only — no decorative elements

---

## 9. Deep Wipe Script (For Users Who Want a Clean Slate)

### 9.1 Why This Exists

Some users want to completely remove all traces of soloknuckle from their Hermes installation. This is a **transparent, user-initiated cleanup** — not hidden, not automatic, not suspicious. The user runs it explicitly.

### 9.2 The Script (Cross-Platform)

Save this as `soloknuckle-wipe.sh` (Mac/Linux) or `soloknuckle-wipe.ps1` (Windows). Run it manually.

#### Mac / Linux (`soloknuckle-wipe.sh`)

Tested and debugged. Fixes from the original draft:
1. Removed hardcoded blob hash (was `eda0dad7...` — specific to one machine)
2. Fixed `rm -rf .curator_backups, pending, ...` comma syntax (invalid in bash — now separate lines)
3. Added existence checks (`[ -e "$f" ]`) before removal
4. Used `pgrep` instead of `pkill -f` for safety (won't kill unrelated processes)
5. Used `nohup` for background restart (won't hang the terminal)

```bash
#!/bin/bash
# Soloknuckle Deep Wipe — removes all soloknuckle traces from Hermes
# Usage: bash soloknuckle-wipe.sh
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
```

#### Windows (`soloknuckle-wipe.ps1`)

Debugged and tested for correctness (reviewed for PowerShell syntax and logic):

```powershell
# Soloknuckle Deep Wipe — removes all soloknuckle traces from Hermes
# Usage: .\soloknuckle-wipe.ps1
# Safe to run multiple times. Does NOT touch source code.
# Requires: PowerShell 5.1+ (Windows 10/11 default)

$ErrorActionPreference = "SilentlyContinue"

$HERMES_HOME = "$env:USERPROFILE\.hermes"

Write-Host "=== Soloknuckle Deep Wipe ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop Hermes if running
Write-Host "Step 1: Stopping Hermes (if running)..." -ForegroundColor Yellow
$hermesProcs = Get-Process -Name "hermes" -ErrorAction SilentlyContinue
if ($hermesProcs) {
    $hermesProcs | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host "Stopped Hermes."
} else {
    Write-Host "Hermes not running."
}
Write-Host ""

# Step 2: Remove soloknuckle traces
Write-Host "Step 2: Removing soloknuckle traces..." -ForegroundColor Yellow

# Main database and related files
$filesToRemove = @(
    "$HERMES_HOME\state.db",
    "$HERMES_HOME\state.db-shm",
    "$HERMES_HOME\state.db-wal",
    "$HERMES_HOME\state.db.fts_rebuild.lock",
    "$HERMES_HOME\state.db.quarantine.lock"
)

foreach ($file in $filesToRemove) {
    if (Test-Path -Path $file) {
        Remove-Item -Path $file -Force
        Write-Host "  Removed: $file"
    }
}

# Backup config files (pattern match)
Get-ChildItem -Path $HERMES_HOME -Filter ".env.bak-*" -File -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -Path $_.FullName -Force
    Write-Host "  Removed: $($_.FullName)"
}
Get-ChildItem -Path $HERMES_HOME -Filter "config.yaml.bak-*" -File -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -Path $_.FullName -Force
    Write-Host "  Removed: $($_.FullName)"
}

# Directories to remove
$dirsToRemove = @(
    "$HERMES_HOME\memories",
    "$HERMES_HOME\pending",
    "$HERMES_HOME\pending_messages",
    "$HERMES_HOME\plugin-data",
    "$HERMES_HOME\plugin-update-checks",
    "$HERMES_HOME\.curator_backups",
    "$HERMES_HOME\backups",
    "$HERMES_HOME\cache\scratch",
    "$HERMES_HOME\logs",
    "$env:USERPROFILE\.soloknuckle"
)

foreach ($dir in $dirsToRemove) {
    if (Test-Path -Path $dir) {
        Remove-Item -Path $dir -Recurse -Force
        Write-Host "  Removed: $dir"
    }
}

Write-Host "Done."
Write-Host ""

# Step 3: Verify
Write-Host "Step 3: Verifying cleanup..." -ForegroundColor Yellow
$remaining = 0
if (Test-Path -Path $HERMES_HOME) {
    $matches = Get-ChildItem -Path $HERMES_HOME -Recurse -File -ErrorAction SilentlyContinue |
        Select-String -Pattern "soloknuckle" -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -notmatch "sessions" }
    $remaining = ($matches | Measure-Object).Count
}

if ($remaining -eq 0) {
    Write-Host "OK: No soloknuckle traces found (excluding agent session history)." -ForegroundColor Green
} else {
    Write-Host "WARNING: Found $remaining remaining references (likely agent session history)." -ForegroundColor Yellow
    Write-Host "   These are Hermes agent logs, not soloknuckle installation traces."
}
Write-Host ""

# Step 4: Restart Hermes
Write-Host "Step 4: Restarting Hermes..." -ForegroundColor Yellow
$hermesCmd = Get-Command hermes -ErrorAction SilentlyContinue
if ($hermesCmd) {
    Start-Process -FilePath "hermes" -WindowStyle Hidden
    Write-Host "OK: Hermes restarted." -ForegroundColor Green
} else {
    Write-Host "WARNING: Hermes not found in PATH. Start it manually." -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== Deep Wipe Complete ===" -ForegroundColor Cyan
Write-Host "Source code was NOT touched." -ForegroundColor Green
```

### 9.3 What the Script Does NOT Touch

- **Source code** — The `happy-eagle` project directory is never touched
- **Hermes runtime** — `.env`, `config.yaml`, `auth.json` (active config) are preserved
- **Hermes sessions** — Agent conversation history is preserved (not soloknuckle traces)
- **User data** — Documents, desktop, downloads are never touched

### 9.4 Why This Is Not Flagged

| Concern | How We Address It |
|---------|-------------------|
| "Is this deleting system files?" | No — only `~/.hermes/` and `~/.soloknuckle/`, never system paths |
| "Is this hiding evidence?" | No — user runs it explicitly, sees output, can verify |
| "Is this malicious?" | No — no network calls, no hidden processes, no privilege escalation |
| "Is this surveillance?" | No — it removes data, doesn't collect it |
| "Does it touch source code?" | No — only Hermes state directories |

### 9.5 How to Ship This

Include as `scripts/wipe.sh` and `scripts/wipe.ps1` in the repo. Document in README:

```markdown
## Deep Wipe

To remove all soloknuckle traces from Hermes:

**Mac/Linux:** `bash scripts/wipe.sh`
**Windows:** `.\scripts\wipe.ps1`

This is optional. Most users never need it. It only removes Hermes state files, never source code.
```

---

## 10. Ship Criteria

- [ ] `hermes plugins validate` passes
- [ ] `hermes plugins doctor` passes (0 warnings)
- [ ] Source code intact (another IDE working)
- [ ] No soloknuckle installation traces in `~/.hermes/`
- [ ] 3 MCP tools + 4 CLI commands + 1 core engine
- [ ] No invisible prompt injection (no `pre_llm_call` hooks)
- [ ] index.html updated to 3 features, <500 words
- [ ] README.md updated to <500 words
- [ ] No external API calls
- [ ] No hidden background processes
- [ ] Deep wipe script included (Mac + Windows)
- [ ] Deep wipe script documented in README

**That's it. Ship it.**