$ErrorActionPreference = 'Continue'
$dataRoot = Join-Path $env:ProgramData 'GiftedLabs\Radiance POS'
$report = @()
$report += "Radiance POS diagnostics - $(Get-Date -Format o)"
$report += "Windows: $([Environment]::OSVersion.VersionString)"
$report += "Install: $((Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Radiance POS_is1' -ErrorAction SilentlyContinue).InstallLocation)"
foreach ($name in 'RadiancePosPostgreSQL', 'RadiancePos') {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    $report += if ($service) { "Service $name: $($service.Status) / $($service.StartType)" } else { "Service $name: MISSING" }
}
try {
    $health = Invoke-RestMethod 'http://127.0.0.1:8080/actuator/health' -TimeoutSec 5
    $report += "Health: $($health.status)"
} catch {
    $report += "Health: DOWN - $($_.Exception.Message)"
}
$report += "Data directory: $dataRoot"
$report += "Free space: $([math]::Round((Get-PSDrive ([IO.Path]::GetPathRoot($dataRoot).TrimEnd('\').TrimEnd(':'))).Free / 1GB, 2)) GB"
$report += ''
$report += 'Recent service log:'
$latestLog = Get-ChildItem (Join-Path $dataRoot 'logs') -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestLog) { $report += Get-Content $latestLog.FullName -Tail 80 }
else { $report += '(no log file found)' }
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) "Radiance-POS-diagnostics-$(Get-Date -Format yyyyMMdd-HHmmss).txt"
$report | Set-Content -LiteralPath $out -Encoding UTF8
Start-Process notepad.exe $out
