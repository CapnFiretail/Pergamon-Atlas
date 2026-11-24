# The local development server's controls (docs/DEVELOPMENT.md). Run through
# dev-server.cmd, which needs no change to the script execution policy:
#
#   tools\dev-server status      running? starts at sign-in?
#   tools\dev-server start       starts it in the background, independent of this
#                                window, VS Code and Claude (Windows itself
#                                creates the process)
#   tools\dev-server stop | restart
#   tools\dev-server install     start it at sign-in: one shortcut in this user's
#                                Startup folder, no administrator rights
#   tools\dev-server uninstall   remove that shortcut
#
# It never stops a process that isn't this repository's server.
param([ValidateSet('status', 'start', 'stop', 'restart', 'install', 'uninstall')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$Port = 4173
$Url = "http://localhost:$Port/"
$Server = Join-Path $PSScriptRoot 'dev-server.mjs'
$Repo = Split-Path $PSScriptRoot
$Log = Join-Path $env:LOCALAPPDATA 'PergamonAtlas\dev-server.log'
$Shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Pergamon Atlas dev server.lnk'

# The processes listening on the port, and which are this server.
function Get-Listeners {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$_" } |
    ForEach-Object { [pscustomobject]@{ Id = $_.ProcessId; Line = $_.CommandLine; Ours = ([string]$_.CommandLine).IndexOf($Server, [StringComparison]::OrdinalIgnoreCase) -ge 0 } }
}
function Test-Server { try { (Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }

function Start-Server {
  $on = @(Get-Listeners)
  if ($on | Where-Object Ours) { "Already running: $Url"; return }
  if ($on) { throw "Port $Port is used by process $($on[0].Id): $($on[0].Line)" }
  $node = (Get-Command node.exe).Source
  $hidden = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = "`"$node`" `"$Server`" --log `"$Log`""; CurrentDirectory = $Repo; ProcessStartupInformation = $hidden }
  if ($r.ReturnValue -ne 0) { throw "Windows could not create the process ($($r.ReturnValue))" }
  for ($i = 0; $i -lt 20; $i++) { if (Test-Server) { "Running: $Url (process $($r.ProcessId))"; return }; Start-Sleep -Milliseconds 500 }
  throw "Started, but $Url does not answer. Log: $Log"
}
function Stop-Server {
  $ours = @(Get-Listeners | Where-Object Ours)
  if (-not $ours) { 'Not running.'; return }
  $ours | ForEach-Object { Stop-Process -Id $_.Id -Force; Wait-Process -Id $_.Id -Timeout 10 -ErrorAction SilentlyContinue }
  'Stopped.'
}

switch ($Action) {
  'start' { Start-Server }
  'stop' { Stop-Server }
  'restart' { Stop-Server; Start-Server }
  'install' {
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($Shortcut)
    $s.TargetPath = Join-Path $PSHOME 'powershell.exe'
    $s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" start"
    $s.WorkingDirectory = $Repo
    $s.WindowStyle = 7
    $s.Description = 'Pergamon Atlas local development server'
    $s.Save()
    "Starts at sign-in: $Shortcut"
  }
  'uninstall' {
    if (Test-Path -LiteralPath $Shortcut) { Remove-Item -LiteralPath $Shortcut; 'No longer starts at sign-in.' } else { 'Was not installed.' }
  }
  'status' {
    $on = @(Get-Listeners)
    $ours = @($on | Where-Object Ours)
    if ($ours) { "Running: $Url (process $($ours[0].Id))" }
    elseif ($on) { "Not running; port $Port is used by process $($on[0].Id): $($on[0].Line)" }
    else { 'Not running.' }
    if (Test-Path -LiteralPath $Shortcut) { 'Starts at sign-in: yes' } else { 'Starts at sign-in: no' }
    "Serves: $Repo"
    "Log: $Log"
  }
}
