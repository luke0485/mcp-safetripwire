$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $projectRoot 'dist\safetripwire.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Build dist/safetripwire.exe first.' }
$stage = Join-Path $projectRoot ('dist\package-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'dist') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'assets') | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $stage 'dist\safetripwire.exe') -Force
foreach ($file in @('MCP-SafeTripwire-Panel.exe', 'MCP-SafeTripwire-Panel.exe.config', 'WebView2Loader.dll', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll')) {
    $source = Join-Path $projectRoot ('dist\' + $file)
    if (-not (Test-Path -LiteralPath $source)) { throw ('Missing panel build output: ' + $source + ' (run tools/build.ps1)') }
    Copy-Item -LiteralPath $source -Destination (Join-Path $stage ('dist\' + $file)) -Force
}
foreach ($file in @('tray.ps1', 'tray.vbs', 'install-desktop-shortcuts.ps1', 'README.md', 'LICENSE', 'SECURITY.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stage -Force
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop\installer\Uninstall.ps1') -Destination (Join-Path $stage 'Uninstall.ps1') -Force
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'tools') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'tools\uninstall.ps1') -Destination (Join-Path $stage 'tools\uninstall.ps1') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets\logo.ico') -Destination (Join-Path $stage 'assets\logo.ico') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets\logo-256.png') -Destination (Join-Path $stage 'assets\logo-256.png') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets\README.md') -Destination (Join-Path $stage 'assets\README.md') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets\readme') -Destination (Join-Path $stage 'assets') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs') -Destination $stage -Recurse -Force
Set-Content -LiteralPath (Join-Path $stage 'Start MCP SafeTripwire.cmd') -Encoding ascii -Value '@start "" wscript.exe "%~dp0tray.vbs"'
$zip = Join-Path $projectRoot 'dist\MCP-SafeTripwire-windows-x64.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
$lines = foreach ($file in @($exe, $zip)) {
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $([IO.Path]::GetFileName($file))"
}
Set-Content -LiteralPath (Join-Path $projectRoot 'dist\SHA256SUMS.txt') -Value $lines -Encoding ascii
Write-Host "Release assets ready in $projectRoot\dist"
