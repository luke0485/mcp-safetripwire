# Installs (or removes) an autostart entry that runs the HTTP proxy at logon.
#
# This is the "always-on" half of the story. Note what it can and cannot do:
#   - the stdio transports need no daemon: the host launches mcp-tripwire itself,
#     so protection is already permanent once a server is wrapped.
#   - url-based (remote) servers need a long-lived local proxy, which is what
#     this entry starts.
#
# Run:  powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
#       powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1 -Remove

param([switch]$Remove)

$ErrorActionPreference = 'Stop'

$Startup = [Environment]::GetFolderPath('Startup')
$Link = Join-Path $Startup 'MCP SafeTripwire proxy.lnk'

if ($Remove) {
    if (Test-Path $Link) {
        Remove-Item $Link
        Write-Host "Removed autostart entry: $Link"
    } else {
        Write-Host 'No autostart entry was installed.'
    }
    exit 0
}

$ProjectDir = $PSScriptRoot
$Launcher = Join-Path $ProjectDir 'tripwire.cmd'
if (-not (Test-Path $Launcher)) {
    throw "Launcher not found: $Launcher"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($Link)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\cmd.exe'
$shortcut.Arguments = '/c "' + $Launcher + '" serve'
$shortcut.WorkingDirectory = $ProjectDir
$shortcut.WindowStyle = 7  # minimized
$shortcut.Description = 'MCP SafeTripwire HTTP proxy (autostart)'
$shortcut.Save()

Write-Host "Autostart installed: $Link"
Write-Host "It runs 'tripwire serve' at logon."
Write-Host "Configure at least one route first, or it will exit immediately."
