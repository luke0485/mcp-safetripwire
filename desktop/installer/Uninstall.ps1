$ErrorActionPreference = 'Continue'
$install = $PSScriptRoot
Write-Host 'MCP SafeTripwire -- uninstall'

# Stop only processes that belong to this installation.
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($install) -and
    ($_.Name -eq 'safetripwire.exe' -or $_.Name -eq 'MCP-SafeTripwire-Panel.exe' -or $_.Name -eq 'wscript.exe' -or $_.Name -eq 'powershell.exe')
} | ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch { }
}
Start-Sleep -Milliseconds 400

# Restore Agent configurations and clear signed relay routes.
$legacy = Join-Path $install 'tools\uninstall.ps1'
if (Test-Path -LiteralPath $legacy) {
    try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $legacy } catch { Write-Host ('  restore step failed: ' + $_.Exception.Message) }
}

# Shortcuts and registry entry.
$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'MCP SafeTripwire'
foreach ($file in @(
    (Join-Path $desktop 'MCP SafeTripwire.lnk'),
    (Join-Path $startMenu 'MCP SafeTripwire.lnk'),
    (Join-Path $startMenu ('Uninstall MCP SafeTripwire.lnk')),
    (Join-Path $startMenu ('卸载 MCP SafeTripwire.lnk'))
)) {
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
}
if (Test-Path -LiteralPath $startMenu) { Remove-Item -LiteralPath $startMenu -Recurse -Force -ErrorAction SilentlyContinue }
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MCP-SafeTripwire' -Recurse -Force -ErrorAction SilentlyContinue

# User data (~/.mcp-tripwire) is kept. Delete it manually for a clean removal.
Write-Host '  user data kept in %USERPROFILE%\.mcp-tripwire'

# The script lives in the folder being removed; delete it after this process exits.
Set-Location $env:TEMP
Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\cmd.exe') `
    -ArgumentList '/c', ('timeout /t 2 >nul & rmdir /s /q "' + $install + '"') `
    -WindowStyle Hidden | Out-Null
Write-Host 'Uninstall complete.'
