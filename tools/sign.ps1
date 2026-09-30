# Code signing helper.
#
# Signing is what turns "an unknown program Windows warns about" into "a
# program with a verifiable publisher". It needs a certificate you own; this
# script only automates the signing step.
#
# Usage:
#   $env:TRIPWIRE_CERT_THUMBPRINT = 'ABCDEF...'      # once per session
#   powershell -ExecutionPolicy Bypass -File .\tools\sign.ps1 -Path .\dist\tripwire.exe
#
# See docs/SIGNING.md for how to obtain a certificate and what each type buys you.

param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Thumbprint = $env:TRIPWIRE_CERT_THUMBPRINT,
    [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Path)) { throw "Nothing to sign at: $Path" }
if ([string]::IsNullOrWhiteSpace($Thumbprint)) {
    throw "No certificate thumbprint. Set `$env:TRIPWIRE_CERT_THUMBPRINT or pass -Thumbprint. See docs/SIGNING.md."
}

function Find-SignTool {
    $candidates = @()
    foreach ($root in @("${env:ProgramFiles(x86)}\Windows Kits\10\bin", "$env:ProgramFiles\Windows Kits\10\bin")) {
        if ($root -and (Test-Path $root)) {
            $candidates += Get-ChildItem -Path $root -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -ExpandProperty FullName
        }
    }
    $onPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }
    if ($candidates.Count -eq 0) { return $null }
    return $candidates[-1]
}

$signtool = Find-SignTool
if (-not $signtool) {
    throw "signtool.exe not found. Install the Windows SDK (Signing Tools) or the MSBuild/VS workload that includes it."
}

Write-Host "Signing : $Path"
Write-Host "Cert    : $Thumbprint"
Write-Host "Tool    : $signtool"

& $signtool sign /sha1 $Thumbprint /tr $TimestampUrl /td sha256 /fd sha256 /v $Path
if ($LASTEXITCODE -ne 0) { throw "signtool sign failed with exit code $LASTEXITCODE" }

Write-Host "Verifying..."
& $signtool verify /pa /v $Path
if ($LASTEXITCODE -ne 0) { throw "signtool verify failed with exit code $LASTEXITCODE" }

Write-Host "Signed and verified: $Path"
