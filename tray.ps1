# MCP SafeTripwire tray app.
#
# This is what the desktop shortcut launches. It is the piece that makes the
# product feel like a program rather than a page:
#   - one tray icon, using the same assets\logo.ico as the shortcut;
#   - a menu with the everyday actions;
#   - Quit actually terminates the background process tree;
#   - severe events pop a notification in the bottom-right corner, like an AV.
#
# Error policy (learned the hard way):
#   - a failure BEFORE the tray is up is fatal and shown in a dialog, because
#     otherwise "the shortcut does nothing";
#   - a failure AFTER the tray is up is logged, never shown modally;
#   - notifications are stateful (one alert per event), and the shutdown path
#     stops the timer FIRST, so no failure can turn one alert into a storm.

param([int]$Port = 8789, [switch]$Diagnose)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
if ([string]::IsNullOrEmpty($root)) { $root = (Get-Location).Path }
$dataDir = Join-Path $env:USERPROFILE '.mcp-tripwire'
$tokenFile = Join-Path $dataDir 'console.token'
$profileDir = Join-Path $dataDir 'app-window'
$traceFile = Join-Path $dataDir 'tray.log'
$System32 = Join-Path $env:SystemRoot 'System32'
$startupComplete = $false
$fatalShown = $false
$script:stopping = $false

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

function Trace([string]$message) {
    try {
        Add-Content -LiteralPath $traceFile -Value ("[{0}] {1}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $message) -Encoding utf8
    } catch { }
}

$zh = ([System.Globalization.CultureInfo]::CurrentUICulture.Name -like 'zh*')
function L($zhText, $enText) { if ($zh) { $zhText } else { $enText } }

trap {
    $err = $_
    $detail = "MCP SafeTripwire could not start." + [char]10 + [char]10 + $err.Exception.Message + [char]10 + [char]10 + $err.ScriptStackTrace
    Trace('FATAL: ' + $detail)
    if (-not $startupComplete -and -not $fatalShown) {
        $fatalShown = $true
        try { [System.Windows.Forms.MessageBox]::Show($detail, 'MCP SafeTripwire', 'OK', 'Error') | Out-Null } catch { }
    }
    exit 1
}

# Env vars whose names contain parentheses (ProgramFiles(x86)) cannot be
# interpolated reliably as ${env:Name(x86)}: that produced a bare drive letter,
# which Test-Path then accepted, and the tray tried to launch "C" as a browser.
# Always go through the API and validate the result.
function Env-Path([string]$name) {
    $v = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($v)) { return $null }
    return $v
}

function Resolve-Exe([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) { return $null }
    if ($path -notmatch '\.exe$') { return $null }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    return $path
}

function Find-Node {
    $candidates = @(
        (Join-Path (Env-Path 'ProgramFiles') 'nodejs\node.exe'),
        (Join-Path (Env-Path 'ProgramFiles(x86)') 'nodejs\node.exe'),
        (Join-Path (Env-Path 'LOCALAPPDATA') 'Programs\nodejs\node.exe'),
        (Join-Path (Env-Path 'APPDATA') 'npm\node.exe')
    )
    foreach ($c in $candidates) { $r = Resolve-Exe $c; if ($r) { return $r } }
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and $cmd.Source -notlike '*WindowsApps*') { return (Resolve-Exe $cmd.Source) }
    return $null
}

function Get-BrowserExe {
    $pf = Env-Path 'ProgramFiles'
    $pf86 = Env-Path 'ProgramFiles(x86)'
    $lad = Env-Path 'LOCALAPPDATA'
    $candidates = @(
        (Join-Path $pf86 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $pf 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $lad 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $pf 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $pf86 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $lad 'Google\Chrome\Application\chrome.exe')
    )
    foreach ($c in $candidates) { $r = Resolve-Exe $c; if ($r) { return $r } }
    return $null
}

function Start-AppWindow([string]$exe, [string]$url) {
    if (-not (Resolve-Exe $exe)) { throw "browser not found at: $exe" }
    $sp = New-Object System.Diagnostics.ProcessStartInfo
    $sp.FileName = $exe
    $sp.Arguments = '--app="{0}" --window-size=1120,780 --user-data-dir="{1}"' -f $url, $profileDir
    $sp.UseShellExecute = $false
    [System.Diagnostics.Process]::Start($sp) | Out-Null
}

# Plain-language wording, so a notification never just shows an internal event
# name like "console-error".
function Event-Label($e) {
    $name = [string]$e.event
    $map = @{
        'console-error'       = (L '程序内部出错' 'Internal error')
        'console-port-in-use' = (L '已经有一个实例在运行' 'Another instance is already running')
        'RUG-PULL-SUSPECTED'  = (L '工具被偷偷改动了' 'A tool was silently changed')
        'enforced-block'      = (L '已阻止一次可疑行为' 'Blocked a suspicious action')
        'static-finding'      = (L '发现可疑的工具描述' 'Found a suspicious tool description')
        'bridge-parse-error'  = (L '本机通道上有无法识别的内容' 'Unreadable data on a local channel')
        'upstream-error'      = (L '远程服务器连接出错' 'Remote server connection failed')
    }
    $text = if ($map.ContainsKey($name)) { $map[$name] } else { $name }
    $detail = [string]$e.gist
    if ([string]::IsNullOrWhiteSpace($detail)) { $detail = [string]$e.error }
    if (-not [string]::IsNullOrWhiteSpace($detail)) { $text = $text + [char]10 + $detail }
    return $text
}

# Mutating a hashtable works regardless of the scope a timer callback runs in;
# plain script variables were not reliable across ticks.
$state = @{
    primed       = $false
    lastTs       = ''
    deadNotified = $false
    mutedUntil   = [datetime]::MinValue
}

$node = Find-Node
$cli = Join-Path $root 'src\cli.js'
$base = "http://127.0.0.1:$Port"
Trace('--- launch ---')
Trace("  root=$root")

# Prefer the packaged single-file build: then the shortcut keeps working even on
# a machine without Node installed.
$packaged = Join-Path $root 'dist\safetripwire.exe'
if (Test-Path -LiteralPath $packaged) {
    $launchFile = $packaged
    $launchArgs = 'console --port {0} --no-open --token-file "{1}"' -f $Port, $tokenFile
    Trace('  launcher=packaged exe')
} else {
    if (-not $node) { throw "Node.js was not found. Install Node 18 or newer from https://nodejs.org/ and try again." }
    if (-not (Test-Path -LiteralPath $cli)) { throw "Missing program file: $cli" }
    $launchFile = $node
    $launchArgs = '"{0}" console --port {1} --no-open --token-file "{2}"' -f $cli, $Port, $tokenFile
    Trace('  launcher=node + source')
}

# Close any panel window left over from a previous launch. Without this the
# browser just re-focuses the OLD window: rendered from a dead server, its
# buttons do nothing and it looks frozen, and no loading indicator ever appears.
function Close-Stale-Panel {
    try {
        Get-CimInstance Win32_Process | Where-Object {
            $_.Name -like 'msedge*' -and $_.CommandLine -like "*$profileDir*"
        } | ForEach-Object {
            & (Join-Path $System32 'taskkill.exe') /PID $_.ProcessId /T /F *> $null
        }
        Start-Sleep -Milliseconds 250
    } catch { }
}

function Open-Panel {
    Close-Stale-Panel
    $exe = Get-BrowserExe
    $u = if ($script:panelUrl) { $script:panelUrl } else { $base }
    Trace("  open-panel: browser=[$exe]")
    if ($exe) {
        try { Start-AppWindow -exe $exe -url $u; Trace('  panel opened as app window'); return }
        catch { Trace('  app-window launch failed: ' + $_.Exception.Message) }
    } else {
        Trace('  no Chromium browser found')
    }
    try {
        $sp = New-Object System.Diagnostics.ProcessStartInfo
        $sp.FileName = $u
        $sp.UseShellExecute = $true
        [System.Diagnostics.Process]::Start($sp) | Out-Null
        Trace('  panel opened via shell')
    } catch {
        Trace('  shell open failed: ' + $_.Exception.Message + ' -- open manually: ' + $u)
    }
}

# Windows named mutex: the atomic single-instance guard. A timing-based check
# is not enough -- a rapid double-click can start several trays before the first
# console is listening, and then each tray sends its own duplicate notifications.
$mutex = New-Object System.Threading.Mutex($false, 'Global\MCPTripwireTray')
$ownsMutex = $false
try { $ownsMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true } catch { $ownsMutex = $false }
if (-not $ownsMutex) {
    # Another tray holds the lock. Defer to it ONLY if it is actually alive:
    # a crashed tray would otherwise block every future launch, which looks
    # exactly like "I double-clicked and nothing happened".
    $held = ''
    if (Test-Path -LiteralPath $tokenFile) { try { $held = (Get-Content -LiteralPath $tokenFile -Raw).Trim() } catch { } }
    $alive = $false
    if ($held.Length -ge 32) {
        try {
            Invoke-RestMethod -Uri "$base/api/status" -Headers @{ 'X-Tripwire-Token' = $held } -TimeoutSec 2 | Out-Null
            $alive = $true
        } catch { $alive = $false }
    }
    if ($alive) {
        Trace('  another instance is alive; opening the panel and exiting')
        $script:panelUrl = "$base/?token=$held"
        Open-Panel
        exit 0
    }
    Trace('  a stale tray holds the mutex but its console is gone; taking over')
}

# ---- single instance -------------------------------------------------------
function Find-ConsoleProcess {
    $matches = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ExecutablePath -eq $launchFile -and
        $_.CommandLine -match '\sconsole\s' -and
        $_.CommandLine -match ('--port\s+' + $Port + '(?:\s|$)') -and
        $_.CommandLine -like ('*' + $tokenFile + '*')
    })
    if ($matches.Count -eq 1) { return Get-Process -Id $matches[0].ProcessId -ErrorAction SilentlyContinue }
    return $null
}
$adoptedConsole = $null
$existing = ''
if (Test-Path -LiteralPath $tokenFile) {
    try { $existing = (Get-Content -LiteralPath $tokenFile -Raw).Trim() } catch { $existing = '' }
}
if ($existing.Length -ge 32) {
    try {
        Invoke-RestMethod -Uri "$base/api/status" -Headers @{ 'X-Tripwire-Token' = $existing } -TimeoutSec 2 | Out-Null
        $adoptedConsole = Find-ConsoleProcess
        if (-not $adoptedConsole) { throw 'Running console could not be identified safely.' }
        Trace('  adopting existing console; restoring tray')
    } catch {
        Trace('  existing instance did not answer; starting fresh')
    }
}

# ---- a fresh token, in a file only this user can read ----------------------
if ($adoptedConsole) {
    $token = $existing
} else {
if (Test-Path -LiteralPath $tokenFile) {
    try { & (Join-Path $System32 'icacls.exe') $tokenFile /inheritance:r /grant:r "$($env:USERNAME):(F)" *> $null } catch { }
    try { Remove-Item -LiteralPath $tokenFile -Force -ErrorAction Stop } catch { }
}
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
Set-Content -LiteralPath $tokenFile -Value $token -NoNewline -Encoding ascii
try { & (Join-Path $System32 'icacls.exe') $tokenFile /inheritance:r /grant:r "$($env:USERNAME):(F)" *> $null } catch { }
Trace('  token written')
}

$script:panelUrl = "$base/?token=$token"
$headers = @{ 'X-Tripwire-Token' = $token }

# ---- start the background console (no window) ----
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $launchFile
$psi.Arguments = $launchArgs
$psi.WorkingDirectory = $root
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$script:consoleProc = if ($adoptedConsole) { $adoptedConsole } else { [System.Diagnostics.Process]::Start($psi) }
Trace("  console started pid=$($script:consoleProc.Id)")

if ($Diagnose) {
    Start-Sleep -Seconds 2
    Write-Host ("  launcher    : " + $launchFile)
    Write-Host ("  console pid : " + $script:consoleProc.Id + "   exited=" + $script:consoleProc.HasExited)
    try {
        $s = Invoke-RestMethod -Uri "$base/api/status" -Headers $headers -TimeoutSec 4
        Write-Host ("  api         : ok (hosts=" + @($s.hosts).Count + ")")
    } catch { Write-Host ("  api         : FAILED -> " + $_.Exception.Message) }
    Write-Host ("  trace log   : " + $traceFile)
    try { & (Join-Path $System32 'taskkill.exe') /PID $script:consoleProc.Id /T /F *> $null } catch { }
    exit 0
}

function Set-Protection([string]$mode) {
    try {
        Invoke-RestMethod -Uri "$base/api/protection" -Method Post -Headers $headers `
            -ContentType 'application/json' -Body (@{ protection = $mode } | ConvertTo-Json) | Out-Null
        $what = if ($mode -eq 'protect') { L '已切换为主动保护' 'Switched to Active protection' } else { L '已切换为只观察' 'Switched to Observe only' }
        $tray.ShowBalloonTip(3000, 'MCP SafeTripwire', $what, [System.Windows.Forms.ToolTipIcon]::Info)
    } catch {
        Trace('set-protection failed: ' + $_.Exception.Message)
    }
}

# ---- tray icon ----
$tray = New-Object System.Windows.Forms.NotifyIcon
$icoPath = Join-Path $root 'assets\logo.ico'
if (Test-Path -LiteralPath $icoPath) { $tray.Icon = New-Object System.Drawing.Icon($icoPath) }
else { $tray.Icon = [System.Drawing.SystemIcons]::Shield }
$tray.Text = 'MCP SafeTripwire'
$tray.Visible = $true
$tray.add_DoubleClick({ Open-Panel })

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miOpen = $menu.Items.Add((L '打开面板' 'Open panel'))
$miObserve = $menu.Items.Add((L '只观察' 'Observe only'))
$miProtect = $menu.Items.Add((L '主动保护' 'Active protection'))
$miRecords = $menu.Items.Add((L '打开记录文件夹' 'Open records folder'))
$miMute = $menu.Items.Add((L '静音通知 1 小时' 'Mute notifications for 1 hour'))
$null = $menu.Items.Add('-')
$miQuit = $menu.Items.Add((L '退出（结束进程）' 'Quit (stop the process)'))
$tray.ContextMenuStrip = $menu

$miOpen.add_Click({ Open-Panel })
$miObserve.add_Click({ Set-Protection 'observe' })
$miProtect.add_Click({ Set-Protection 'protect' })
$miRecords.add_Click({ try { & (Join-Path $System32 'explorer.exe') $dataDir } catch { Trace('open records failed: ' + $_.Exception.Message) } })
$miMute.add_Click({
    $state.mutedUntil = (Get-Date).AddHours(1)
    try { $tray.ShowBalloonTip(3000, 'MCP SafeTripwire', (L '通知已静音 1 小时' 'Notifications muted for 1 hour'), [System.Windows.Forms.ToolTipIcon]::Info) } catch { }
})

# Stopping must be idempotent and must kill the timer FIRST: if the message loop
# ever fails to exit, a live timer would keep firing and turn a single alert into
# an endless storm of popups.
function Stop-Everything {
    if ($script:stopping) { return }
    $script:stopping = $true
    Trace('stopping')
    try { $timer.Stop() } catch { }
    try { & (Join-Path $System32 'taskkill.exe') /PID $script:consoleProc.Id /T /F *> $null } catch { }
    # Hide once, let the shell paint that, then dispose. Visible=$false
    # immediately followed by Dispose() made the icon flash on the way out.
    try { $tray.Visible = $false } catch { }
    Start-Sleep -Milliseconds 150
    try { $tray.Dispose() } catch { }
    try { $mutex.ReleaseMutex() } catch { }
    try { [System.Windows.Forms.Application]::ExitThread() } catch { }
    # Last resort only, after the message loop had its chance to end.
    Start-Sleep -Milliseconds 400
    exit 0
}
$miQuit.add_Click({ Stop-Everything })

# ---- poll for severe events and pop a notification ----
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 4000
$timer.add_Tick({
    try {
        if ($null -eq $script:consoleProc -or $script:consoleProc.HasExited) {
            # One hiccup must not cost the user their tray: bring the
            # background back, and only give up after repeated failures.
            $replacement = Find-ConsoleProcess
            if ($replacement) { $script:consoleProc = $replacement; $state.restarts = 0; return }
            if ($state.nextRetryAt -and (Get-Date) -lt $state.nextRetryAt) { return }
            $state.restarts = [int]$state.restarts + 1
            $state.nextRetryAt = (Get-Date).AddSeconds([Math]::Min(60, 4 * [Math]::Pow(2, [Math]::Min(4, $state.restarts - 1))))
            Trace('  console gone; restart attempt ' + $state.restarts)
            try {
                $script:consoleProc = [System.Diagnostics.Process]::Start($psi)
                Trace('  restarted pid=' + $script:consoleProc.Id)
                return
            } catch { }
            if (-not $state.deadNotified) {
                $state.deadNotified = $true
                try { $tray.ShowBalloonTip(5000, 'MCP SafeTripwire', (L '后台已停止' 'The background process stopped'), [System.Windows.Forms.ToolTipIcon]::Error) } catch { }
            }
            # Keep the tray available even when the backend cannot restart.
            # Only its Quit menu ends this lifecycle.
            $tray.Text = L 'MCP SafeTripwire - 后台恢复中' 'MCP SafeTripwire - recovering'
            return
        }
        $r = Invoke-RestMethod -Uri "$base/api/events?limit=20" -Headers $headers -TimeoutSec 3
        $state.restarts = 0
        $state.deadNotified = $false
        $tray.Text = 'MCP SafeTripwire'
        $events = @($r.events)
        if ($events.Count -eq 0) { return }
        $maxTs = (@($events | ForEach-Object { [string]$_.ts }) | Sort-Object)[-1]
        if ([string]::IsNullOrWhiteSpace($maxTs)) { return }
        if (-not $state.primed -or [string]::IsNullOrEmpty($state.lastTs)) {
            # First look (or after a mute): remember where we are, announce nothing historic.
            $state.primed = $true
            $state.lastTs = $maxTs
            return
        }
        $fresh = @($events | Where-Object { $_.level -eq 'critical' -and ([string]$_.ts -gt $state.lastTs) })
        $state.lastTs = $maxTs
        if ((Get-Date) -lt $state.mutedUntil) { return }
        $shown = 0
        foreach ($e in $fresh) {
            if ($shown -ge 3) { break }
            $shown++
            $body = Event-Label $e
            if ($body.Length -gt 220) { $body = $body.Substring(0, 220) + [char]8230 }
            $tray.ShowBalloonTip(7000, (L 'MCP SafeTripwire 警告' 'MCP SafeTripwire alert'), $body, [System.Windows.Forms.ToolTipIcon]::Warning)
        }
    } catch {
        Trace('tick error: ' + $_.Exception.Message)
    }
})
$timer.Start()

$startupComplete = $true
Trace('  tray ready')
Open-Panel

[System.Windows.Forms.Application]::Run((New-Object System.Windows.Forms.ApplicationContext))

