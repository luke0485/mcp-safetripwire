[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
$prefix = $workspace + '\'
$relativeTargets = @('.tmp-video\deps', '.tmp-npm-cache', 'dist\tripwire.blob', 'dist\sea-config.json')
$targets = @($relativeTargets | ForEach-Object { Join-Path $workspace $_ })
$targets += @(Get-ChildItem -LiteralPath $workspace -File -Force |
    Where-Object { $_.Name -like '.tmp-security-*' -and $_.Extension -in @('.txt', '.json') } |
    ForEach-Object { $_.FullName })
$bytes = 0L
foreach ($target in $targets) {
    $absolute = [IO.Path]::GetFullPath($target)
    if (-not $absolute.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cache target outside workspace' }
    if (-not (Test-Path -LiteralPath $absolute)) { continue }
    $item = Get-Item -LiteralPath $absolute -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked cache target: $absolute" }
    $children = if ($item.PSIsContainer) { @(Get-ChildItem -LiteralPath $absolute -Recurse -Force) } else { @() }
    if ($children | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw "Refusing linked cache contents: $absolute" }
    $size = if ($item.PSIsContainer) { ($children | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum } else { $item.Length }
    if ($PSCmdlet.ShouldProcess($absolute, 'Remove reproducible project cache')) {
        Remove-Item -LiteralPath $absolute -Recurse -Force
        $bytes += [long]$size
    }
}
Write-Output ('Cache cleared: {0:N1} MiB' -f ($bytes / 1MB))
