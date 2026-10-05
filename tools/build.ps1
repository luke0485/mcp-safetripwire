# Builds dist\tripwire.exe -- a single executable that needs no Node installed.
#
# Pipeline:
#   esbuild  -> one CommonJS file (also constant-folds the __TRIPWIRE_BUILT__
#               define so the bundled code never references import.meta)
#   SEA      -> a preparation blob that Node can run
#   postject -> injects that blob into a copy of node.exe
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\tools\build.ps1
#   powershell -ExecutionPolicy Bypass -File .\tools\build.ps1 -SkipInstall

param([switch]$SkipInstall, [string]$OutputName = 'safetripwire.exe')

$ErrorActionPreference = 'Stop'
if ($OutputName -notmatch '^[A-Za-z0-9._-]+\.exe$') { throw 'OutputName must be an exe file name.' }
$builtExe = Join-Path 'dist' $OutputName
$root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrEmpty($root)) { $root = (Get-Location).Path }
Push-Location $root
try {
    if (-not $SkipInstall) {
        Write-Host 'Installing build tools (esbuild, postject)...'
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
    }

    New-Item -ItemType Directory -Force -Path dist | Out-Null

    Write-Host 'Bundling...'
    npx esbuild src/cli.js --bundle --platform=node --target=node22 --format=cjs --main-fields=module,main `
        --outfile=dist/tripwire.cjs --define:__TRIPWIRE_BUILT__=true
    if ($LASTEXITCODE -ne 0) { throw "esbuild failed ($LASTEXITCODE)" }
    # UMD dependencies can leave runtime relative requires which SEA cannot
    # resolve. Prefer ESM entries and smoke-test the bundle before injection.
    node dist/tripwire.cjs doctor | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Bundled CLI smoke test failed ($LASTEXITCODE)" }

    Write-Host 'Preparing SEA blob...'
    $seaConfig = @{
        main                          = 'dist/tripwire.cjs'
        output                        = 'dist/tripwire.blob'
        disableExperimentalSEAWarning = $true
    }
    $seaConfig | ConvertTo-Json | Set-Content -Path dist/sea-config.json -Encoding ascii
    node --experimental-sea-config dist/sea-config.json
    if ($LASTEXITCODE -ne 0) { throw "SEA blob generation failed ($LASTEXITCODE)" }

    Write-Host 'Injecting blob into a copy of node.exe...'
    $nodeExe = (Get-Command node.exe).Source
    # Copying over the previous exe intermittently fails with an IOException:
    # a scanner or the indexer holds the file for a moment. Retry with
    # backoff rather than failing the build (or renaming by hand).
    $copied = $false
    for ($i = 1; $i -le 6; $i++) {
        try {
            Copy-Item $nodeExe $builtExe -Force -ErrorAction Stop
            $copied = $true
            break
        } catch {
            Write-Host ("  copy attempt " + $i + " failed; retrying...")
            Start-Sleep -Seconds 3
        }
    }
    if (-not $copied) { throw "could not overwrite dist/tripwire.exe after 6 attempts" }

    # The published node.exe is Authenticode-signed; injection invalidates that
    # signature and postject refuses to write into a signed image, so strip it
    # first. The result must be re-signed with tools/sign.ps1 afterwards.
    $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -Last 1
    if ($signtool) {
        & $signtool.FullName remove /s $builtExe 2>$null | Out-Null
    } else {
        Write-Host '  (signtool not found; if injection fails, strip the signature manually)'
    }

    npx postject $builtExe NODE_SEA_BLOB dist/tripwire.blob `
        --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    if ($LASTEXITCODE -ne 0) { throw "postject failed ($LASTEXITCODE)" }

    $size = [math]::Round((Get-Item $builtExe).Length / 1MB, 1)
    Write-Host ''
    Write-Host "Built: $builtExe  ($size MB)"
    Write-Host 'Next: sign it with tools\sign.ps1 (see docs\SIGNING.md).'
    # Publisher metadata ("署名"). This is NOT a code signature: it does not
    # remove the SmartScreen warning, but it is what appears under
    # Properties -> Details, and it makes the product look finished.
    Write-Host 'Applying publisher metadata...'
    # rcedit spawns a helper (rcedit-x64.exe) that HANGS on this 86MB
    # single-file build. Left alone it becomes an orphan holding
    # dist/tripwire.exe, which then breaks every later build with an
    # IOException. Bound it, and kill the whole tree on timeout.
    $metaProc = Start-Process -FilePath 'node' -ArgumentList @('tools/rcedit.mjs', $builtExe) -PassThru -WindowStyle Hidden
    if (-not $metaProc.WaitForExit(30000)) {
        & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $metaProc.Id /T /F *> $null
        Write-Host '  (publisher metadata skipped: rcedit timed out; the exe still works)'
    }
    if ($LASTEXITCODE -ne 0) { Write-Host '  (rcedit failed; the exe still works, it just lacks metadata)' }
    Write-Host 'Note: SEA does not embed a Windows icon; use rcedit on the exe to set assets\logo.ico.'
}
finally {
    Pop-Location
}

