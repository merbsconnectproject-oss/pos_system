$ErrorActionPreference = 'Continue'

# This runs with no console attached, so nothing may fail silently: a
# diagnostics tool that reports nothing is worse than none at all.
trap {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "Diagnostics could not finish.`n`n$($_.Exception.Message)",
        'Radiance POS', 'OK', 'Error') | Out-Null
    exit 64
}

$dataRoot = Join-Path $env:ProgramData 'GiftedLabs\Radiance POS'
$report = @()
$report += "Radiance POS diagnostics - $(Get-Date -Format o)"
$report += "Windows: $([Environment]::OSVersion.VersionString)"
$report += "PowerShell: $($PSVersionTable.PSVersion)"
$versionFile = Join-Path (Split-Path $PSScriptRoot -Parent) 'VERSION.txt'
$report += if (Test-Path $versionFile) { Get-Content $versionFile } else { 'Version: VERSION.txt missing (installed before the build stamp)' }
# VERSION.txt carries the mode the build stamped; this is the one the counter
# is actually using, which is the question when two variants are being compared.
$overrideFile = Join-Path $dataRoot 'config\launch-mode.txt'
if (Test-Path $overrideFile) {
    $report += "Launch mode: $((Get-Content -Raw $overrideFile).Trim()) (per-counter override)"
}
# Inno keys the uninstall entry by AppId, not by AppName. Reading the wrong key
# is why this line was blank on every machine it has ever run on.
$uninstallKey = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{42A61CD0-F7D4-4C9F-A59C-688C2CE694A8}_is1'
$installed = Get-ItemProperty $uninstallKey -ErrorAction SilentlyContinue
$report += "Install: $(if ($installed) { "$($installed.InstallLocation) ($($installed.DisplayVersion))" } else { 'not registered' })"
foreach ($name in 'RadiancePosPostgreSQL', 'RadiancePos') {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    # ${name}, not $name, before a colon. PowerShell reads "$name:" as a scope
    # qualifier the way "$env:PATH" is one, so this file did not parse at all
    # and the Start-menu diagnostics entry could only ever flash and vanish.
    $report += if ($service) { "Service ${name}: $($service.Status) / $($service.StartType)" } else { "Service ${name}: MISSING" }
}
# The service runs as LOCAL SERVICE and must be able to read its own
# configuration. When onboarding does not reach the step that grants it, the
# service starts, is refused the file, and the only evidence is a Java stack
# trace at the bottom of a log. Asked and answered here instead.
$configFile = Join-Path $dataRoot 'config\application.properties'
if (Test-Path $configFile) {
    $rights = (& icacls.exe $configFile 2>$null) -join ' '
    $readable = $rights -match 'LOCAL SERVICE' -or $rights -match 'S-1-5-19'
    $report += "Config readable by the service: $(if ($readable) { 'yes' } else { 'NO - LOCAL SERVICE has no rights to application.properties' })"
} else {
    $report += 'Config readable by the service: no application.properties - onboarding never completed'
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

