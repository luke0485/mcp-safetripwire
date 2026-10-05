# Creates the single desktop entry point for MCP SafeTripwire.
#
# One icon, launching the tray through PowerShell directly. A .vbs launcher is a
# common malware shape and gets flagged by endpoint security, which is how a
# shortcut ends up silently doing nothing on a machine with an AV product.
#
# Run:  powershell -ExecutionPolicy Bypass -File .\install-desktop-shortcuts.ps1

$ErrorActionPreference = 'Stop'

$ProjectDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($ProjectDir)) { $ProjectDir = (Get-Location).Path }

$TrayScript = Join-Path $ProjectDir 'tray.ps1'   # kept for the fallback launcher
if (-not (Test-Path -LiteralPath $TrayScript)) { throw "Tray script not found: $TrayScript" }

$Desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell

# Remove the earlier multi-icon layout if it is still around.
foreach ($legacy in @('MCP SafeTripwire (menu).lnk', 'MCP SafeTripwire (source).lnk')) {
    $p = Join-Path $Desktop $legacy
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force
        Write-Host "Removed old shortcut: $legacy"
    }
}

$launcherExe = Join-Path $env:SystemRoot 'System32\wscript.exe'
$link = Join-Path $Desktop 'MCP SafeTripwire.lnk'

$sc = $shell.CreateShortcut($link)
$sc.TargetPath = $launcherExe
# [char]34 is a double quote. Building the argument string by concatenating
# escaped quotes is what made the earlier version of this script throw.
$sc.Arguments = [char]34 + (Join-Path $ProjectDir 'tray.vbs') + [char]34
$sc.WorkingDirectory = $ProjectDir
$sc.Description = 'MCP SafeTripwire'

$icon = Join-Path $ProjectDir 'assets\logo.ico'
if (Test-Path -LiteralPath $icon) {
    $sc.IconLocation = $icon
    Write-Host "Using icon: $icon"
} else {
    Write-Host 'No assets\logo.ico found yet; using the default icon.'
}

$sc.Save()

$check = $shell.CreateShortcut($link)
Write-Host "Desktop shortcut ready: $link"
Write-Host ("  target: " + $check.TargetPath)
Write-Host ("  args  : " + $check.Arguments)
Write-Host ("  icon  : " + $check.IconLocation)
