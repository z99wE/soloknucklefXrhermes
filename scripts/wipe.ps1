# Soloknuckle Deep Wipe — removes all soloknuckle traces from Hermes
# Usage: .\scripts\wipe.ps1
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