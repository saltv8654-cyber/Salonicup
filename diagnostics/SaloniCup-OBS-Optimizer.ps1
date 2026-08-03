# ============================================================
#  SaloniCup OBS Optimizer  (Dell Latitude 7410 / Intel QuickSync)
#  Applies SAFE, reversible Windows tweaks and creates OBS profiles.
#  Run via SaloniCup-OBS-Optimizer.bat (double-click, elevates).
# ============================================================

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$stamp   = Get-Date -Format 'yyyyMMdd_HHmmss'
$desktop = [Environment]::GetFolderPath('Desktop')
$backup  = Join-Path $desktop "SaloniCup-Backup-$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
$log = New-Object System.Text.StringBuilder
function L { param($t=''); [void]$log.AppendLine([string]$t); Write-Host $t }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
L "SaloniCup OBS Optimizer"
L ("Time  : " + (Get-Date))
L ("Admin : $admin")
L ("Backup: $backup")
L ''

# Restore script we build up as we go
$restore = New-Object System.Text.StringBuilder
[void]$restore.AppendLine('@echo off')
[void]$restore.AppendLine('echo Restoring SaloniCup optimizations...')

# ---------- 1) POWER ----------
L '== POWER =='
try {
  $active = (powercfg /getactivescheme)
  $oldGuid = ($active | Select-String '([0-9a-f-]{36})').Matches.Value
  L "Current power scheme GUID: $oldGuid"
  [void]$restore.AppendLine("powercfg /setactive $oldGuid")

  # Prefer High performance; if missing, duplicate Ultimate Performance
  $HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
  $list = powercfg /list
  if ($list -match [regex]::Escape($HIGH)) {
    powercfg /setactive $HIGH | Out-Null
    L 'Activated: High performance'
  } else {
    $dup = powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>$null
    $newG = ($dup | Select-String '([0-9a-f-]{36})').Matches.Value
    if ($newG) { powercfg /setactive $newG | Out-Null; L 'Activated: Ultimate Performance' }
    else { powercfg /setactive $HIGH | Out-Null; L 'Activated: High performance (fallback)' }
  }
  # USB selective suspend OFF (on AC + DC)
  powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 | Out-Null
  powercfg /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 | Out-Null
  # PCI Express link state power management = Off
  powercfg /setacvalueindex SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 0 | Out-Null
  powercfg /setactive SCHEME_CURRENT | Out-Null
  L 'USB selective suspend: OFF | PCIe link state: OFF'
} catch { L "  power step skipped: $($_.Exception.Message)" }
L ''

# ---------- 2) GAME DVR / GAME BAR (background capture off) ----------
L '== GAME DVR / GAME BAR =='
try {
  reg export "HKCU\System\GameConfigStore" "$backup\GameConfigStore.reg" /y | Out-Null
  [void]$restore.AppendLine("reg import `"%~dp0GameConfigStore.reg`"")
  reg add "HKCU\System\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f | Out-Null
  reg add "HKCU\System\GameConfigStore" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 2 /f | Out-Null

  if (Test-Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR") {
    reg export "HKLM\SOFTWARE\Policies\Microsoft\Windows\GameDVR" "$backup\GameDVR_policy.reg" /y | Out-Null
    [void]$restore.AppendLine("reg import `"%~dp0GameDVR_policy.reg`"")
  } else {
    [void]$restore.AppendLine("reg delete `"HKLM\SOFTWARE\Policies\Microsoft\Windows\GameDVR`" /f")
  }
  reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f | Out-Null
  L 'Game DVR / background game capture: OFF'
} catch { L "  gamedvr step skipped: $($_.Exception.Message)" }
L ''

# ---------- 3) GPU PREFERENCE (OBS + browsers -> high performance) ----------
L '== GPU PREFERENCE =='
try {
  $key = 'HKCU\Software\Microsoft\DirectX\UserGpuPreferences'
  reg export $key "$backup\UserGpuPreferences.reg" /y 2>$null | Out-Null
  [void]$restore.AppendLine("reg import `"%~dp0UserGpuPreferences.reg`" 2>nul")
  $exes = @()
  Get-ChildItem 'C:\Program Files\obs-studio\bin\64bit\obs64.exe','C:\Program Files (x86)\obs-studio\bin\64bit\obs64.exe' -ErrorAction SilentlyContinue | % { $exes += $_.FullName }
  Get-ChildItem 'C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ErrorAction SilentlyContinue | % { $exes += $_.FullName }
  foreach ($e in $exes) {
    reg add $key /v $e /t REG_SZ /d "GpuPreference=2;" /f | Out-Null
    L "  high-performance GPU set for: $e"
  }
  if (-not $exes.Count) { L '  (OBS/Chrome not found in default paths - skipped; harmless on single-GPU laptop)' }
} catch { L "  gpu-pref step skipped: $($_.Exception.Message)" }
L ''

# ---------- 4) OBS PROFILES (QuickSync) ----------
L '== OBS PROFILES =='
$obsRunning = Get-Process obs64, obs -ErrorAction SilentlyContinue
$obsCfg = Join-Path $env:APPDATA 'obs-studio\basic\profiles'
if ($obsRunning) {
  L 'OBS is running - close it and re-run to create the profiles. (Windows tweaks above are already applied.)'
} elseif (-not (Test-Path (Join-Path $env:APPDATA 'obs-studio'))) {
  L 'OBS config folder not found (install & run OBS once first). Skipped profiles.'
} else {
  function New-Profile($name, $cx, $cy, $fps, $vbitrate) {
    $dir = Join-Path $obsCfg $name
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $ini = @"
[General]
Name=$name

[Video]
BaseCX=1920
BaseCY=1080
OutputCX=$cx
OutputCY=$cy
FPSType=1
FPSCommon=$fps
ScaleType=bicubic
ColorFormat=NV12
ColorSpace=709
ColorRange=Partial

[Output]
Mode=Simple

[SimpleOutput]
VBitrate=$vbitrate
StreamEncoder=qsv
RecQuality=Small
RecEncoder=qsv
FileNameWithoutSpace=true
"@
    Set-Content -Path (Join-Path $dir 'basic.ini') -Value $ini -Encoding ASCII
    L "  created profile: $name  ($cx x$cy @ $fps, ${vbitrate}kbps, QuickSync)"
  }
  New-Profile 'SaloniCup 1080p30' 1920 1080 30 8000
  New-Profile 'SaloniCup 720p60'  1280 720  60 6000
  L 'In OBS: Profile menu -> pick "SaloniCup 1080p30" (start here). If it locks 30fps easily, try "SaloniCup 720p60".'
}
L ''

# ---------- write restore + report ----------
[void]$restore.AppendLine('echo Done. A reboot is recommended.')
[void]$restore.AppendLine('pause')
Set-Content -Path (Join-Path $backup 'SaloniCup-RESTORE.bat') -Value $restore.ToString() -Encoding ASCII

L '== NEXT STEPS =='
L ' 1) Open OBS -> Profile menu -> choose "SaloniCup 1080p30".'
L ' 2) Settings -> Output -> confirm Encoder = QuickSync H.264. Settings -> Video -> 1920x1080 / 30fps.'
L ' 3) Turn OFF Studio Mode. Right-click preview -> Disable Preview while live.'
L ' 4) Add your camera (DroidCam) + a Browser Source (1920x1080) with the SaloniCup overlay link.'
L ' 5) Run SaloniCup-Diagnostic.bat during a 10-min test stream to check "__ / 30 FPS" and dropped/lagged frames.'
L ''
L "To undo everything: run  $backup\SaloniCup-RESTORE.bat  then reboot."

$report = Join-Path $desktop "SaloniCup-Optimizer_$stamp.txt"
$log.ToString() | Set-Content -Path $report -Encoding UTF8
Write-Host ''
Write-Host ("Report saved: " + $report) -ForegroundColor Cyan
Write-Host ("Restore script: " + (Join-Path $backup 'SaloniCup-RESTORE.bat')) -ForegroundColor Cyan
try { Start-Process notepad.exe $report } catch {}
