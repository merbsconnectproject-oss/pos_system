$ErrorActionPreference = 'SilentlyContinue'
$installRoot = Split-Path $PSScriptRoot -Parent
$wrapper = Join-Path $installRoot 'service\RadiancePosService.exe'
if (Test-Path $wrapper) {
    & $wrapper stop | Out-Null
    & $wrapper uninstall | Out-Null
}
Stop-Service RadiancePosPostgreSQL -Force
$pgCtl = Join-Path $installRoot 'postgresql\bin\pg_ctl.exe'
if (Test-Path $pgCtl) { & $pgCtl unregister -N RadiancePosPostgreSQL | Out-Null }
# ProgramData is deliberately retained: uninstalling the application must not
# silently delete the shop's sales database or backups.
