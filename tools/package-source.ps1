# Create a source-only archive; never include local data, dependencies or diagnostic logs.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$allowed = @('src','test','tools','docs','examples','assets','desktop','.github','package.json','package-lock.json','README.md','LICENSE','SECURITY.md','.gitignore','tray.ps1','tray.vbs','tripwire.cmd','install-autostart.ps1','install-desktop-shortcuts.ps1')
$stage = Join-Path $env:TEMP ('mcp-safetripwire-source-' + [guid]::NewGuid().ToString('N'))
$outputZip = Join-Path $projectRoot 'dist\MCP-SafeTripwire-source.zip'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
try {
    foreach ($name in $allowed) {
        $candidate = Join-Path $projectRoot $name
        if (Test-Path -LiteralPath $candidate) {
            Copy-Item -LiteralPath $candidate -Destination $stage -Recurse -Force
        }
    }
    # Test runs leave lock files, audit JSONL and result directories behind.
    # They are local evidence, not source, and must not be published.
    foreach ($relative in @('tools\offline-lab\results', 'tools\offline-lab\original-advanced.json', 'tools\offline-lab\original-state.json')) {
        $target = Join-Path $stage $relative
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    }
    Get-ChildItem -LiteralPath $stage -Recurse -File -Force |
        Where-Object { $_.Name -like '*.lock' -or $_.Name -like '*.jsonl' -or $_.Name -like '*.log' -or $_.Name -like '*.key' -or $_.Name -like '*.tripwire-backup-*' } |
        Remove-Item -Force
    $items = @(Get-ChildItem -LiteralPath $stage -Force | ForEach-Object { $_.FullName })
    Compress-Archive -LiteralPath $items -DestinationPath $outputZip -Force
    Write-Host "Source archive: $outputZip"
} finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
