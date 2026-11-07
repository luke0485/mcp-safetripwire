$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$version = '1.0.4314.35'
$cache = Join-Path $workspace 'tools\.cache'
$pkgDir = Join-Path $cache ('webview2-' + $version)
$nupkg = Join-Path $cache ('microsoft.web.webview2.' + $version + '.nupkg')
$outDir = Join-Path $workspace 'dist'
$outExe = Join-Path $outDir 'MCP-SafeTripwire-Panel.exe'

New-Item -ItemType Directory -Force -Path $cache, $outDir | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $pkgDir 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'))) {
    if (-not (Test-Path -LiteralPath $nupkg)) {
        Write-Host 'Downloading WebView2 SDK...'
        Invoke-WebRequest -UseBasicParsing -Uri ("https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/" + $version + "/microsoft.web.webview2." + $version + ".nupkg") -OutFile $nupkg
    }
    $zip = $nupkg + '.zip'
    Copy-Item -LiteralPath $nupkg -Destination $zip -Force
    if (Test-Path -LiteralPath $pkgDir) { Remove-Item -LiteralPath $pkgDir -Recurse -Force }
    Expand-Archive -LiteralPath $zip -DestinationPath $pkgDir -Force
}

$csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { throw 'csc.exe not found (.NET Framework 4.x is required).' }
$core = Join-Path $pkgDir 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$winforms = Join-Path $pkgDir 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
$loader = Join-Path $pkgDir 'runtimes\win-x64\native\WebView2Loader.dll'
$icon = Join-Path $workspace 'assets\logo.ico'
foreach ($file in @($core, $winforms, $loader, $icon)) {
    if (-not (Test-Path -LiteralPath $file)) { throw ('Missing build input: ' + $file) }
}

$cscArgs = @(
    '-nologo',
    '-codepage:65001',
    '-target:winexe',
    '-platform:x64',
    '-optimize+',
    ('-out:' + $outExe),
    ('-win32icon:' + $icon),
    ('-win32manifest:' + (Join-Path $workspace 'desktop\app.manifest')),
    '-r:System.dll',
    '-r:System.Core.dll',
    '-r:System.Drawing.dll',
    '-r:System.Windows.Forms.dll',
    '-r:System.Net.Http.dll',
    ('-r:' + $core),
    ('-r:' + $winforms),
    (Join-Path $workspace 'desktop\Panel.cs')
)
& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw ('Panel compilation failed (' + $LASTEXITCODE + ')') }
foreach ($dll in @('Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll')) {
    Copy-Item -LiteralPath (Join-Path $pkgDir ('lib\net462\' + $dll)) -Destination (Join-Path $outDir $dll) -Force
}
Copy-Item -LiteralPath $loader -Destination (Join-Path $outDir 'WebView2Loader.dll') -Force
Copy-Item -LiteralPath (Join-Path $workspace 'desktop\MCP-SafeTripwire-Panel.exe.config') -Destination (Join-Path $outDir 'MCP-SafeTripwire-Panel.exe.config') -Force
Write-Host ('Panel built: ' + $outExe)
