$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $workspace 'dist\MCP-Tripwire-Offline-Test'
$exe = Join-Path $workspace 'dist\safetripwire.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Build dist/safetripwire.exe first (tools/build.ps1).' }
# Start from a clean stage: previous runs left lock files, audit logs and a
# manually named binary behind, which must not ship as part of the test kit.
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $stage 'runtime') | Out-Null
$nodeExe = (Get-Command node.exe).Source
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $stage 'runtime\node.exe') -Force
Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $nodeExe) 'LICENSE') -Destination (Join-Path $stage 'runtime\NODE-LICENSE.txt') -Force
foreach ($entry in @('server','broker','control','test')) {
    $source = if ($entry -eq 'test') { 'runner' } else { $entry }
    & (Join-Path $workspace 'node_modules\.bin\esbuild.cmd') (Join-Path $workspace "tools\offline-lab\$source.js") --bundle --platform=node --target=node22 --format=cjs "--outfile=$stage\$entry.cjs"
    if ($LASTEXITCODE -ne 0) { throw "Lab bundle failed: $entry" }
}
Copy-Item -LiteralPath $exe -Destination (Join-Path $stage 'tripwire.exe') -Force
Copy-Item -LiteralPath (Join-Path $workspace 'tools\offline-lab\README-TEST.txt') -Destination (Join-Path $stage 'README-TEST.txt') -Force
Copy-Item -LiteralPath (Join-Path $workspace 'tools\offline-lab\SAFETY.md') -Destination (Join-Path $stage 'SAFETY.md') -Force
Copy-Item -LiteralPath (Join-Path $workspace 'LICENSE') -Destination (Join-Path $stage 'LICENSE') -Force
Set-Content -LiteralPath (Join-Path $stage '1-Offline-Self-Test.cmd') -Encoding ascii -Value '@echo off', 'chcp 65001 >nul', 'cd /d "%~dp0"', '"%~dp0runtime\node.exe" "%~dp0test.cjs"', 'pause'
Set-Content -LiteralPath (Join-Path $stage '2-Prepare-WorkBuddy.cmd') -Encoding ascii -Value '@echo off', 'chcp 65001 >nul', 'cd /d "%~dp0"', '"%~dp0runtime\node.exe" "%~dp0control.cjs" --init --desktop', 'if errorlevel 1 goto end', 'notepad "%~dp0WorkBuddy-MCP.json"', ':end', 'pause'
Set-Content -LiteralPath (Join-Path $stage '3-Control-Panel.cmd') -Encoding ascii -Value '@echo off', 'chcp 65001 >nul', 'cd /d "%~dp0"', '"%~dp0runtime\node.exe" "%~dp0control.cjs" --desktop', 'pause'
Set-Content -LiteralPath (Join-Path $stage '4-Stop-Lab.cmd') -Encoding ascii -Value '@echo off', 'chcp 65001 >nul', 'cd /d "%~dp0"', '"%~dp0runtime\node.exe" "%~dp0control.cjs" --stop', 'pause'
Set-Content -LiteralPath (Join-Path $stage '0-Open-Tripwire.cmd') -Encoding ascii -Value '@echo off', 'start "" "%~dp0tripwire.exe" console'
$hashes = Get-ChildItem -LiteralPath $stage -File -Recurse | Where-Object { $_.Name -ne 'SHA256SUMS.txt' -and $_.FullName -notlike '*\results\*' -and $_.Name -ne 'WorkBuddy-MCP.json' } | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $_.FullName.Substring($stage.Length + 1) }
Set-Content -LiteralPath (Join-Path $stage 'SHA256SUMS.txt') -Encoding ascii -Value $hashes
Write-Output "Offline test package: $stage"
