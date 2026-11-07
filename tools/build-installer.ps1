$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$payload = Join-Path $workspace 'dist\MCP-SafeTripwire-windows-x64.zip'
if (-not (Test-Path -LiteralPath $payload)) { throw 'Run tools/package-release.ps1 first; the installer embeds that ZIP.' }
$csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { throw 'csc.exe not found (.NET Framework 4.x is required).' }
$out = Join-Path $workspace 'dist\MCP-SafeTripwire-Setup.exe'
$icon = Join-Path $workspace 'assets\logo.ico'
$manifest = Join-Path $workspace 'desktop\app.manifest'

$cscArgs = @(
    '-nologo',
    '-codepage:65001',
    '-target:winexe',
    '-platform:x64',
    '-optimize+',
    ('-out:' + $out),
    ('-win32icon:' + $icon),
    ('-win32manifest:' + $manifest),
    '-r:System.dll',
    '-r:System.Core.dll',
    '-r:System.Drawing.dll',
    '-r:System.Windows.Forms.dll',
    '-r:System.IO.Compression.dll',
    '-r:System.IO.Compression.FileSystem.dll',
    ('-resource:' + $payload + ',payload.zip'),
    ('-resource:' + (Join-Path $workspace 'assets\logo-256.png') + ',logo.png'),
    (Join-Path $workspace 'desktop\installer\Setup.cs')
)
& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw ('Installer compilation failed (' + $LASTEXITCODE + ')') }
$size = [math]::Round((Get-Item -LiteralPath $out).Length / 1MB, 1)
$sumFile = Join-Path $workspace 'dist\SHA256SUMS.txt'
$hash = (Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant()
$lines = @()
if (Test-Path -LiteralPath $sumFile) {
    $lines = @(Get-Content -LiteralPath $sumFile | Where-Object { $_ -notmatch 'MCP-SafeTripwire-Setup\.exe$' })
}
$lines += ($hash + '  MCP-SafeTripwire-Setup.exe')
Set-Content -LiteralPath $sumFile -Value $lines -Encoding ascii
Write-Host ('Installer built: ' + $out + ' (' + $size + ' MB)')
