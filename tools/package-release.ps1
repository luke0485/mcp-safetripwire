$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $projectRoot 'dist\tripwire.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Build dist/tripwire.exe first.' }
$stage = Join-Path $projectRoot 'dist\portable'
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'dist') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'assets') | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $stage 'dist\tripwire.exe') -Force
foreach ($file in @('tray.ps1', 'tray.vbs', 'install-desktop-shortcuts.ps1', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stage -Force
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets\logo.ico') -Destination (Join-Path $stage 'assets\logo.ico') -Force
Set-Content -LiteralPath (Join-Path $stage 'Start MCP Tripwire.cmd') -Encoding ascii -Value '@start "" wscript.exe "%~dp0tray.vbs"'
$zip = Join-Path $projectRoot 'dist\MCP-Tripwire-windows-x64.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
$lines = foreach ($file in @($exe, $zip)) {
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $([IO.Path]::GetFileName($file))"
}
Set-Content -LiteralPath (Join-Path $projectRoot 'dist\SHA256SUMS.txt') -Value $lines -Encoding ascii
Write-Host "Release assets ready in $projectRoot\dist"
