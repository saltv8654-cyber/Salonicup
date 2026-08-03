# ============================================================
#  SaloniCup Diagnostic Kit
#  Full health report of a Windows laptop for OBS livestreaming.
#  Run via SaloniCup-Diagnostic.bat (double-click).
# ============================================================

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$report   = New-Object System.Text.StringBuilder
$findings = New-Object System.Collections.ArrayList

function Line { param($t=''); [void]$report.AppendLine([string]$t); Write-Host $t }
function Head { param($t); Line ''; Line ('=' * 62); Line ("  $t"); Line ('=' * 62) }
function Warn { param($t); [void]$findings.Add($t) | Out-Null }
function Pct  { param($free,$size); if ($size -gt 0) { [math]::Round($free / $size * 100) } else { 0 } }

# ---------- header ----------
Line 'SALONICUP DIAGNOSTIC KIT'
Line ("Generated : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
Line ("Admin     : $admin")
if (-not $admin) { Warn 'Not running as Administrator - SMART/temps/driver checks limited.' }

# ---------- SYSTEM ----------
Head 'SYSTEM'
$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
Line ("Device    : {0} {1}" -f $cs.Manufacturer, $cs.Model)
Line ("OS        : {0} (Build {1})" -f $os.Caption, $os.BuildNumber)
$boot = $os.LastBootUpTime
if ($boot) { Line ("Uptime    : {0:dd\.hh\:mm} (since {1})" -f ((Get-Date) - $boot), $boot) }
$scheme = (powercfg /getactivescheme) 2>$null
if ($scheme) {
  $planName = ($scheme -replace '.*\(([^)]*)\).*', '$1')
  Line ("Power plan: $planName")
  if ($planName -notmatch 'High|Best|Ultimate') { Warn "Power plan is '$planName' - set to High/Best performance for streaming." }
}

# ---------- CPU ----------
Head 'CPU'
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
Line ("Model : " + ($cpu.Name.Trim()))
Line ("Cores : {0} physical / {1} logical" -f $cpu.NumberOfCores, $cpu.NumberOfLogicalProcessors)
Line ("Clock : {0} MHz base" -f $cpu.MaxClockSpeed)
$load = $cpu.LoadPercentage
Line ("Load  : {0}% (right now)" -f $load)
if ($load -gt 80) { Warn "CPU load is high right now ($load%)." }
Line 'Top processes by total CPU time:'
Get-Process | Sort-Object CPU -Descending | Select-Object -First 6 | ForEach-Object {
  Line ("  {0,-26} {1,9:n0} s" -f $_.ProcessName, [double]$_.CPU)
}

# ---------- RAM ----------
Head 'MEMORY (RAM)'
$totKB = $os.TotalVisibleMemorySize; $freeKB = $os.FreePhysicalMemory
$totGB = [math]::Round($totKB / 1MB, 1); $freeGB = [math]::Round($freeKB / 1MB, 1)
$usedPct = if ($totKB) { [math]::Round(($totKB - $freeKB) / $totKB * 100) } else { 0 }
Line ("Total : {0} GB" -f $totGB)
Line ("Free  : {0} GB (used {1}%)" -f $freeGB, $usedPct)
if ($usedPct -gt 85) { Warn "RAM usage high ($usedPct%)." }
if ($totGB -lt 8)    { Warn "Only $totGB GB RAM - tight for 1080p OBS." }
Line 'Top processes by memory:'
Get-Process | Sort-Object WS -Descending | Select-Object -First 6 | ForEach-Object {
  Line ("  {0,-26} {1,7:n0} MB" -f $_.ProcessName, ($_.WS / 1MB))
}

# ---------- STORAGE ----------
Head 'STORAGE (SSD / HDD)'
Get-PhysicalDisk | ForEach-Object {
  Line ("Disk  : {0} | {1} | health: {2} | {3} GB" -f $_.FriendlyName, $_.MediaType, $_.HealthStatus, [math]::Round($_.Size / 1GB))
  if ($_.HealthStatus -and $_.HealthStatus -ne 'Healthy') { Warn ("Disk health {0} = {1}" -f $_.FriendlyName, $_.HealthStatus) }
  $rc = $_ | Get-StorageReliabilityCounter
  if ($rc) {
    Line ("   SMART: Temp {0}C | Wear {1}% | ReadErrTotal {2} | WriteErrUncorrected {3}" -f $rc.Temperature, $rc.Wear, $rc.ReadErrorsTotal, $rc.WriteErrorsUncorrected)
    if ($rc.Temperature -gt 60) { Warn ("Disk temperature high: {0}C" -f $rc.Temperature) }
    if ($rc.Wear -gt 80)        { Warn ("SSD wear high: {0}%" -f $rc.Wear) }
  }
}
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
  $fp = Pct $_.FreeSpace $_.Size
  Line ("Volume {0}  {1} GB free / {2} GB  ({3}% free)" -f $_.DeviceID, [math]::Round($_.FreeSpace / 1GB, 1), [math]::Round($_.Size / 1GB, 1), $fp)
  if ($fp -lt 12) { Warn ("Low free space on {0} ({1}% free)." -f $_.DeviceID, $fp) }
}
Line 'Quick disk speed test (128 MB):'
try {
  $tmp = Join-Path $env:TEMP 'salonicup_disktest.tmp'
  $buf = New-Object byte[] (33554432)   # 32 MB
  (New-Object Random).NextBytes($buf)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $fs = [IO.File]::Create($tmp)
  for ($i = 0; $i -lt 4; $i++) { $fs.Write($buf, 0, $buf.Length) }
  $fs.Flush($true); $fs.Close(); $sw.Stop()
  $wMBs = [math]::Round(128 / $sw.Elapsed.TotalSeconds)
  $sw.Restart(); $fs = [IO.File]::OpenRead($tmp); $rb = New-Object byte[] (8388608)
  while ($fs.Read($rb, 0, $rb.Length) -gt 0) {}; $fs.Close(); $sw.Stop()
  $rMBs = [math]::Round(128 / $sw.Elapsed.TotalSeconds)
  Remove-Item $tmp -Force
  Line ("  Write ~{0} MB/s | Read ~{1} MB/s (read may be cached)" -f $wMBs, $rMBs)
  if ($wMBs -lt 80) { Warn ("Slow disk write (~{0} MB/s) - likely HDD or failing SSD." -f $wMBs) }
} catch { Line "  (disk test skipped)" }

# ---------- INTERNET ----------
Head 'INTERNET'
$wlan = netsh wlan show interfaces 2>$null
if ($wlan) {
  ($wlan | Select-String 'SSID|Signal|Radio type|Receive rate|Transmit rate|Channel') | ForEach-Object { Line ("  " + $_.ToString().Trim()) }
  $sigLine = ($wlan | Select-String '^\s*Signal')
  if ($sigLine) {
    $sigN = [int](($sigLine.ToString() -replace '[^0-9]', ''))
    if ($sigN -and $sigN -lt 55) { Warn "Weak WiFi signal ($sigN%) - move closer / use 5GHz or cable." }
  }
}
$ping = Test-Connection 1.1.1.1 -Count 4 -ErrorAction SilentlyContinue
if ($ping) {
  $avg = [math]::Round(($ping | Measure-Object -Property ResponseTime -Average).Average)
  Line ("Ping 1.1.1.1 : avg {0} ms" -f $avg)
  if ($avg -gt 80) { Warn "High latency ($avg ms)." }
} else { Warn 'No ping response - internet may be down.' }
try { $ipi = Invoke-RestMethod 'http://ip-api.com/json' -TimeoutSec 6; if ($ipi) { Line ("ISP : {0} - {1} ({2})" -f $ipi.isp, $ipi.city, $ipi.query) } } catch {}
try {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $data = (New-Object Net.WebClient).DownloadData('https://speed.cloudflare.com/__down?bytes=25000000')
  $sw.Stop()
  $mbps = [math]::Round(($data.Length * 8) / $sw.Elapsed.TotalSeconds / 1MB, 1)
  Line ("Download test: ~{0} Mbps" -f $mbps)
} catch { Line "  (download test skipped)" }
Line 'NOTE: streaming needs good UPLOAD. For 1080p30 aim for >= 8-10 Mbps STABLE upload.'

# ---------- USB & CAMERAS ----------
Head 'USB & CAMERAS'
Line 'Cameras / imaging devices:'
$cams = Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in 'Camera', 'Image' }
if ($cams) { $cams | ForEach-Object { Line ("  [{0}] {1}" -f $_.Status, $_.FriendlyName); if ($_.Status -ne 'OK') { Warn ("Camera device problem: {0} ({1})" -f $_.FriendlyName, $_.Status) } } }
else { Line '  none detected (connect the phone/camera first)' }
Line 'USB devices with problems:'
$badusb = Get-PnpDevice -PresentOnly | Where-Object { $_.Class -eq 'USB' -and $_.Status -ne 'OK' }
if ($badusb) { $badusb | ForEach-Object { Line ("  [{0}] {1}" -f $_.Status, $_.FriendlyName); Warn ("USB device problem: {0}" -f $_.FriendlyName) } } else { Line '  none' }

# ---------- GPU & DRIVERS ----------
Head 'GPU & DRIVERS'
Get-CimInstance Win32_VideoController | ForEach-Object {
  Line ("GPU   : {0}" -f $_.Name)
  Line ("  Driver {0}  (date {1:yyyy-MM-dd})" -f $_.DriverVersion, $_.DriverDate)
  if ($_.DriverDate -and $_.DriverDate -lt (Get-Date).AddYears(-2)) { Warn ("GPU driver looks old ({0:yyyy-MM-dd}) - update it." -f $_.DriverDate) }
}
Line 'Devices reporting problems (Device Manager):'
$bad = Get-PnpDevice -PresentOnly | Where-Object { $_.Status -ne 'OK' -and $_.Status -ne 'Unknown' }
if ($bad) { $bad | Select-Object -First 15 | ForEach-Object { Line ("  [{0}] {1} ({2})" -f $_.Status, $_.FriendlyName, $_.Class) }; Warn ("{0} device(s) report problems in Device Manager." -f @($bad).Count) }
else { Line '  none' }

# ---------- TEMPERATURES ----------
Head 'TEMPERATURES'
try {
  $tz = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop
  $tz | ForEach-Object {
    $c = [math]::Round($_.CurrentTemperature / 10 - 273.15, 1)
    Line ("  Thermal zone: {0} C" -f $c)
    if ($c -gt 90) { Warn ("High temperature: {0} C - clean fans / check cooling." -f $c) }
  }
} catch {
  Line '  Not exposed by Windows on this laptop.'
  Line '  Tip: install HWiNFO64 (free) for accurate CPU/GPU temps during a test stream.'
}

# ---------- OBS ----------
Head 'OBS STUDIO'
$obsProc = Get-Process obs64, obs -ErrorAction SilentlyContinue
Line ("Running now : " + [bool]$obsProc)
$logDir = Join-Path $env:APPDATA 'obs-studio\logs'
if (Test-Path $logDir) {
  $log = Get-ChildItem $logDir -Filter *.txt | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($log) {
    Line ("Latest log  : {0}  ({1:yyyy-MM-dd HH:mm})" -f $log.Name, $log.LastWriteTime)
    $c = Get-Content $log.FullName -Raw
    Line '  --- key settings from log ---'
    ($c -split "`n" | Select-String 'video settings reset|output.*scaled|fps|CPU Name|CPU Speed|Physical Cores|Physical Memory|Adapter 1:|NVENC|QuickSync|x264|Loading up D3D11|max bitrate|rate control') | Select-Object -First 22 | ForEach-Object { Line ("  " + $_.ToString().Trim()) }
    Line '  --- frame stats (end of session) ---'
    $lag  = ($c | Select-String 'lagged frames due to rendering'      | Select-Object -Last 1)
    $skip = ($c | Select-String 'skipped frames due to encoding'      | Select-Object -Last 1)
    $drop = ($c | Select-String 'dropped frames due to insufficient'  | Select-Object -Last 1)
    foreach ($m in @($lag, $skip, $drop)) { if ($m) { Line ("  " + $m.ToString().Trim()) } }
    if ($lag  -and $lag.ToString()  -match ':\s*\d+\s*\(([\d.]+)%\)' -and [double]$matches[1] -gt 1) { Warn "OBS RENDERING lag ($($matches[1])%) -> GPU/compositor bottleneck: turn OFF Studio Mode, Disable Preview, lower Base canvas." }
    if ($skip -and $skip.ToString() -match ':\s*\d+\s*\(([\d.]+)%\)' -and [double]$matches[1] -gt 1) { Warn "OBS ENCODING lag ($($matches[1])%) -> CPU/encoder overload: use hardware encoder (QuickSync/NVENC), lower output res/fps." }
    if ($drop -and $drop.ToString() -match ':\s*\d+\s*\(([\d.]+)%\)' -and [double]$matches[1] -gt 1) { Warn "OBS DROPPED frames ($($matches[1])%) -> network/upload bottleneck: lower bitrate or use wired/better upload." }
  }
} else { Line 'No OBS logs found (OBS not installed or never run for this user).' }

# ---------- QUICK BENCHMARK ----------
Head 'QUICK CPU BENCHMARK'
$sw = [Diagnostics.Stopwatch]::StartNew(); $x = 0.0
for ($i = 0; $i -lt 8000000; $i++) { $x += [math]::Sqrt($i) }
$sw.Stop()
$ms = [math]::Round($sw.Elapsed.TotalMilliseconds)
Line ("Single-thread math: {0} ms (lower = faster; >4000 ms is a weak/throttled CPU)" -f $ms)
if ($ms -gt 4000) { Warn "CPU benchmark slow ($ms ms) - may be throttling (heat/power) or a low-power CPU." }

# ---------- RECOMMENDED OBS SETTINGS ----------
Head 'RECOMMENDED OBS SETTINGS (SaloniCup)'
Line ' Video  : Base 1920x1080 | Output 1280x720 (or 1080p if CPU allows) | 30 FPS'
Line ' Output : Hardware encoder (QuickSync / NVENC) if available | CBR | 6000 kbps (720p) or 8000 kbps (1080p)'
Line ' UI     : Studio Mode OFF | right-click preview -> Disable Preview while live'
Line ' Power  : plan = Best performance | laptop plugged in'
Line ' Overlay: Browser Source 1920x1080 with the SaloniCup overlay URL'

# ---------- write report ----------
$head = New-Object System.Text.StringBuilder
[void]$head.AppendLine('################  SUMMARY / FINDINGS  ################')
if ($findings.Count -eq 0) { [void]$head.AppendLine('  No major issues detected. See details below.') }
else { $findings | ForEach-Object { [void]$head.AppendLine('  [!] ' + $_) } }
[void]$head.AppendLine('#####################################################')
[void]$head.AppendLine('')

$desktop = [Environment]::GetFolderPath('Desktop')
$outFile = Join-Path $desktop ("SaloniCup-Report_{0}.txt" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
($head.ToString() + $report.ToString()) | Set-Content -Path $outFile -Encoding UTF8

Write-Host ''
Write-Host '################  SUMMARY / FINDINGS  ################' -ForegroundColor Cyan
if ($findings.Count -eq 0) { Write-Host '  No major issues detected.' -ForegroundColor Green }
else { $findings | ForEach-Object { Write-Host ('  [!] ' + $_) -ForegroundColor Yellow } }
Write-Host ''
Write-Host ("Report saved to: " + $outFile) -ForegroundColor Cyan
Start-Process notepad.exe $outFile
