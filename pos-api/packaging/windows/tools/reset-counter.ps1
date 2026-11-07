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

# Disabling the services is what stops them racing the delete, and leaving them
# that way would hand setup a failure of its own: it calls Start-Service, and a
# disabled service refuses. Anything that survived the unregister goes back to
# automatic before this script is finished with it.
foreach ($name in 'RadiancePos', 'RadiancePosPostgreSQL') {
    if (Get-Service $name -ErrorAction SilentlyContinue) {
        Write-Host "$name is still registered; setting it back to automatic so setup can start it."
        Set-Service $name -StartupType Automatic -ErrorAction SilentlyContinue
    }
}

if (Test-Path $DataRoot) {
    # Log files are held open by the service wrapper and are the usual survivors.
    # They are also the one thing setup does not read: onboarding keys off
    # install-state.json, the secrets, the config and the cluster. Leftover logs
    # are not a reason to send somebody hunting handles.
    $remaining = @(Get-ChildItem $DataRoot -Recurse -Force -File -ErrorAction SilentlyContinue)
    $blocking = @($remaining | Where-Object { $_.FullName -notlike (Join-Path $DataRoot 'logs\*') })
    Write-Host ''
    if ($blocking.Count -eq 0) {
        Write-Host 'The counter is clean enough to set up again - only log files remain,' -ForegroundColor Green
        Write-Host 'and setup does not read those. Start "Configure or repair Radiance POS".' -ForegroundColor Green
        exit 0
    }
    Write-Host "Could not remove $($blocking.Count) item(s) that setup does read:" -ForegroundColor Red
    $blocking | ForEach-Object { Write-Host "  $($_.FullName)" }
    Write-Host ''
    Write-Host 'Restart Windows and run this again - the services are disabled now, so'
    Write-Host 'nothing will reopen them. If it still fails, anti-virus or ransomware'
    Write-Host 'protection is holding the folder. Check with:'
    Write-Host '  Get-MpPreference | Select EnableControlledFolderAccess'
    exit 64
}

Write-Host ''
Write-Host 'The counter is clean. Start "Configure or repair Radiance POS" from the' -ForegroundColor Green
Write-Host 'Start menu to set it up again.' -ForegroundColor Green
