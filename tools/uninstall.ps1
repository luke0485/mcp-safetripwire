# One-click full uninstall of MCP Tripwire.
#
# What it does, in order:
#   1. restores every host config from its newest Tripwire backup
#   2. clears the local HTTP relay routes
#   3. removes the desktop shortcut and the autostart entry
#   4. with -Purge, deletes the state directory (audit log, token, registry)
#
# It deliberately does NOT touch anything it did not create. It reports every
# action so the result can be checked afterwards.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\tools\uninstall.ps1
#   powershell -ExecutionPolicy Bypass -File .\tools\uninstall.ps1 -Purge

param([switch]$Purge)

$ErrorActionPreference = 'Continue'
$ProjectDir = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrEmpty($ProjectDir)) { $ProjectDir = (Get-Location).Path }
$dataDir = Join-Path $env:USERPROFILE '.mcp-tripwire'
$Desktop = [Environment]::GetFolderPath('Desktop')

Write-Host 'MCP SafeTripwire -- full uninstall'
Write-Host ''

# 1) restore host configs from the newest backup of each
function Get-HostConfigs {
    $paths = @(
        (Join-Path $env:USERPROFILE '.codex\config.toml'),
        (Join-Path $env:USERPROFILE '.cursor\mcp.json'),
        (Join-Path $env:APPDATA 'Claude\claude_desktop_config.json')
    )
    return $paths | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
}

foreach ($cfg in Get-HostConfigs) {
    $dir = Split-Path -Parent $cfg
    $base = Split-Path -Leaf $cfg
    $backups = @(Get-ChildItem -LiteralPath $dir -Filter "$base.tripwire-backup-*" -ErrorAction SilentlyContinue | Sort-Object Name)
    if ($backups.Count -eq 0) {
        Write-Host ("  no backup for " + $cfg + " (nothing to restore)")
        continue
    }
    $newest = $backups[$backups.Count - 1]
    try {
        # Keep the current file too: it may contain edits made after enrolment.
        $safety = $cfg + '.tripwire-before-uninstall-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        Copy-Item -LiteralPath $cfg -Destination $safety -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath $newest.FullName -Destination $cfg -Force -ErrorAction Stop
        Write-Host ("  restored " + $cfg + " from " + $newest.Name + " (previous copy: " + $safety + ")")
    } catch {
        Write-Host ("  FAILED to restore " + $cfg + ": " + $_.Exception.Message)
    }
}

# 2) clear relay routes. Delete the data file AND its HMAC key: writing an
# unsigned empty file while keeping the key makes every later load fail closed
# and prevents a re-install from saving new routes.
$routes = Join-Path $dataDir 'routes.json'
foreach ($file in @($routes, $routes + '.key', $routes + '.lock')) {
    if (Test-Path -LiteralPath $file) {
        try {
            Remove-Item -LiteralPath $file -Force -ErrorAction Stop
            Write-Host ("  removed " + $file)
        } catch {
            Write-Host ('  FAILED to remove ' + $file + ': ' + $_.Exception.Message)
        }
    }
}

# 3) shortcut + autostart
foreach ($name in @('MCP SafeTripwire.lnk', 'MCP Tripwire.lnk', 'MCP Tripwire (menu).lnk', 'MCP Tripwire (source).lnk')) {
    $p = Join-Path $Desktop $name
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
        Write-Host ("  removed shortcut " + $name)
    }
}
$startupNames = @('MCP SafeTripwire proxy.lnk', 'MCP Tripwire proxy.lnk')
foreach ($name in $startupNames) {
    $startup = Join-Path ([Environment]::GetFolderPath('Startup')) $name
    if (Test-Path -LiteralPath $startup) {
        Remove-Item -LiteralPath $startup -Force -ErrorAction SilentlyContinue
        Write-Host ("  removed autostart entry " + $name)
    }
}

# 4) optional state purge
if ($Purge) {
    if (Test-Path -LiteralPath $dataDir) {
        Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host ("  purged state directory " + $dataDir)
    }
} else {
    Write-Host ("  state kept at " + $dataDir + " (pass -Purge to delete audit log and registry)")
}

Write-Host ''
Write-Host 'Done. The source tree was left in place; delete the project folder to finish.'
