# Tears a half-configured counter back down to nothing, so setup can start clean.
#
# Onboarding that fails partway leaves a running service, a registered database
# and a data directory whose permissions setup never finished applying. Every
# attempt to clear that by hand has the same two traps: the application service
# restarts itself five seconds after being stopped, and a recursive delete over
# files that are still open is reported as "access denied" rather than "in use".
# So this disables before it stops, unregisters before it deletes, and says
# which step failed rather than leaving one message to cover all of them.
#
#   powershell -ExecutionPolicy Bypass -File reset-counter.ps1
#
# This deletes the sales database. It is for a counter that never finished
# setup; a trading shop restores from a backup instead.

$ErrorActionPreference = 'Continue'
$InstallRoot = Split-Path $PSScriptRoot -Parent
$DataRoot = Join-Path $env:ProgramData 'GiftedLabs\Radiance POS'

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    return ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Host 'Run this from an administrator PowerShell window.' -ForegroundColor Red
    exit 64
}

Write-Host 'Disabling the services so they cannot restart themselves...'
foreach ($name in 'RadiancePos', 'RadiancePosPostgreSQL') {
    if (Get-Service $name -ErrorAction SilentlyContinue) {
        Set-Service $name -StartupType Disabled -ErrorAction SilentlyContinue
        Stop-Service $name -Force -ErrorAction SilentlyContinue
    }
}

Write-Host 'Unregistering them...'
$wrapper = Join-Path $InstallRoot 'service\RadiancePosService.exe'
if (Test-Path $wrapper) { & $wrapper uninstall 2>&1 | Out-Null }
$pgCtl = Join-Path $InstallRoot 'postgresql\bin\pg_ctl.exe'
if (Test-Path $pgCtl) { & $pgCtl unregister -N RadiancePosPostgreSQL 2>&1 | Out-Null }

# Anything still holding a file keeps the delete from succeeding, and the
# message for that is indistinguishable from a permissions problem.
$stragglers = Get-Process -Name 'java', 'postgres', 'RadiancePosService' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and ($_.Path.StartsWith($InstallRoot, 'OrdinalIgnoreCase')) }
foreach ($process in $stragglers) {
    Write-Host "Stopping leftover process $($process.ProcessName) ($($process.Id))..."
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep 3

if (Test-Path $DataRoot) {
    Write-Host 'Taking ownership of the data directory...'
    & takeown.exe /F $DataRoot /R /A /D Y 2>&1 | Out-Null
    & icacls.exe $DataRoot '/reset' '/T' '/C' 2>&1 | Out-Null
    # A read-only or hidden attribute refuses a delete on its own, and neither
    # is visible in an ACL — which is where this hunt has ended twice.
    Get-ChildItem $DataRoot -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try { $_.Attributes = 'Normal' } catch { }
    }

    Write-Host 'Deleting the data directory...'
    Remove-Item $DataRoot -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path $DataRoot) {
    $remaining = @(Get-ChildItem $DataRoot -Recurse -Force -ErrorAction SilentlyContinue).Count
    Write-Host ''
    Write-Host "Could not remove $DataRoot - $remaining item(s) remain." -ForegroundColor Red
    Write-Host 'Something outside Windows permissions is holding it. The usual cause is'
    Write-Host 'anti-virus or ransomware protection. Check with:'
    Write-Host '  Get-MpPreference | Select EnableControlledFolderAccess'
    exit 64
}

Write-Host ''
Write-Host 'The counter is clean. Start "Configure or repair Radiance POS" from the' -ForegroundColor Green
Write-Host 'Start menu to set it up again.' -ForegroundColor Green
