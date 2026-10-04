# Keeps the two desktop artefacts in step with the working copy:
#   1. "MCP SafeTripwire 源码"  - a snapshot of the source tree
#   2. "MCP SafeTripwire.lnk"   - the launcher shortcut (icon + target)
# Run this after any change worth handing over.
param([switch]$SourceOnly)
$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrEmpty($ProjectDir)) { $ProjectDir = (Get-Location).Path }
$Desktop = [Environment]::GetFolderPath('Desktop')

$dest = Join-Path $Desktop 'MCP SafeTripwire 源码'
if ([IO.Path]::GetFullPath($ProjectDir).TrimEnd('\') -ieq [IO.Path]::GetFullPath($dest).TrimEnd('\')) {
    Write-Host 'Working copy is already the desktop source folder; no copy needed.'
} else {
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    robocopy $ProjectDir $dest /E /XD node_modules dist .git /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Source sync failed ($LASTEXITCODE)" }
}
$count = (Get-ChildItem $dest -Recurse -File).Count
Write-Host ("source snapshot : " + $count + " files -> " + $dest)

if (-not $SourceOnly) { & (Join-Path $ProjectDir 'install-desktop-shortcuts.ps1') }
