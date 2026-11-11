# Soloknuckle uninstaller (Windows) - removes Soloknuckle's own files only.
#
# Usage: .\scripts\uninstall.ps1
#
# Scope, deliberately narrow: the Hermes plugin directory, Soloknuckle's plugin
# data, and %USERPROFILE%\.soloknuckle. It does NOT stop Hermes and does NOT
# touch state.db, memories, logs, backups, or anything else.

$ErrorActionPreference = "Stop"

$HermesHome = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:USERPROFILE ".hermes" }

$targets = @(
    (Join-Path $HermesHome "plugins\soloknuckle"),
    (Join-Path $HermesHome "plugin-data\soloknuckle"),
    (Join-Path $env:USERPROFILE ".soloknuckle")
)

Write-Host "Soloknuckle uninstall"
Write-Host ""

$removed = 0
foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
        Write-Host "  removed  $target"
        $removed++
    }
    else {
        Write-Host "  absent   $target"
    }
}

Write-Host ""
Write-Host "Removed $removed path(s)."

if (Get-Command soloknuckle -ErrorAction SilentlyContinue) {
    Write-Host ""
    Write-Host "The 'soloknuckle' command is still on your PATH. If you installed it with npm:"
    Write-Host "  npm uninstall -g soloknuckle"
}

Write-Host ""
Write-Host "Git hooks installed by 'soloknuckle init' live in each project's .git\hooks."
Write-Host "Delete pre-commit and pre-push there (pre-commit.local / pre-push.local hold"
Write-Host "any hook that was there before)."
Write-Host ""
Write-Host "Nothing else was touched. Restart Hermes to unload the plugin."
