param([string]$CamId, [string]$Clip, [string]$Tag = "windows")

$Root = "C:\Users\Allen\Desktop\VisioSphere\VisioSphere-\ai_core"
$Py   = "$Root\venv\Scripts\python.exe"
$Base = [IO.Path]::GetFileNameWithoutExtension($Clip)
Set-Location $Root

# kill only our own leftovers, not every python on the machine
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
  Where-Object { $_.CommandLine -match 'cctv_core|mock_backend' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 1

# point .env at this clip (forward slashes — dotenv/OpenCV handle them fine)
$src = "$Root/test_videos/falls/$Clip" -replace '\\','/'
(Get-Content "$Root\.env") `
  -replace '^CAM_0_ID=.*',     "CAM_0_ID=$CamId" `
  -replace '^CAM_0_SOURCE=.*', "CAM_0_SOURCE=$src" |
  Set-Content "$Root\.env"

Remove-Item "$Root\alert_log.json" -ErrorAction SilentlyContinue

$mock = Start-Process $Py -ArgumentList "mock_backend.py" -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput "$Root\mock.log" -RedirectStandardError "$Root\mock.err"
Start-Sleep 2

$core = Start-Process $Py -ArgumentList "-u","cctv_core.py" -PassThru -NoNewWindow `
        -RedirectStandardOutput "$Root\run_${Tag}_$Base.log" `
        -RedirectStandardError  "$Root\run_${Tag}_$Base.err"
if (-not $core.WaitForExit(120000)) { $core.Kill() }

Stop-Process -Id $mock.Id -Force -ErrorAction SilentlyContinue

if (Test-Path "$Root\alert_log.json") {
  Copy-Item "$Root\alert_log.json" "$Root\alerts_${Tag}_$Base.json" -Force
  Write-Host "=== $Base : saved alerts_${Tag}_$Base.json ==="
} else {
  Write-Host "=== $Base : NO ALERTS ==="
}