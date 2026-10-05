# Create a source-only archive; never include local data, dependencies or diagnostic logs.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$allowed = @('src','test','tools','docs','examples','assets','.github','package.json','package-lock.json','README.md','LICENSE','SECURITY.md','.gitignore','tray.ps1','tray.vbs','tripwire.cmd','install-autostart.ps1','install-desktop-shortcuts.ps1')
$paths = foreach ($name in $allowed) {
    $candidate = Join-Path $projectRoot $name
    if (Test-Path -LiteralPath $candidate) { $candidate }
}
$outputZip = Join-Path $projectRoot 'dist\MCP-SafeTripwire-source.zip'
Compress-Archive -LiteralPath $paths -DestinationPath $outputZip -Force
Write-Host "Source archive: $outputZip"
