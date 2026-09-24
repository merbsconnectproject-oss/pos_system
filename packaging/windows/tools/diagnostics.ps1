$ErrorActionPreference = 'Continue'

# This runs with no console attached, so nothing may fail silently: a
# diagnostics tool that reports nothing is worse than none at all.
trap {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "Diagnostics could not finish.`n`n$($_.Exception.Message)",
        'Radiance POS', 'OK', 'Error') | Out-Null
    exit 1
}

$dataRoot = Join-Path $env:ProgramData 'GiftedLabs\Radiance POS'
$report = @()
$report += "Radiance POS diagnostics - $(Get-Date -Format o)"
$report += "Windows: $([Environment]::OSVersion.VersionString)"
$report += "Install: $((Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Radiance POS_is1' -ErrorAction SilentlyContinue).InstallLocation)"
foreach ($name in 'RadiancePosPostgreSQL', 'RadiancePos') {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    # ${name}, not $name, before a colon. PowerShell reads "$name:" as a scope
    # qualifier the way "$env:PATH" is one, so this file did not parse at all
    # and the Start-menu diagnostics entry could only ever flash and vanish.
    $report += if ($service) { "Service ${name}: $($service.Status) / $($service.StartType)" } else { "Service ${name}: MISSING" }
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

