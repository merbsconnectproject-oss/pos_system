$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName PresentationFramework

$installRoot = Split-Path $PSScriptRoot -Parent
$dataRoot = Join-Path $env:ProgramData 'GiftedLabs\Radiance POS'
$configPath = Join-Path $dataRoot 'config\application.properties'
$backupKey = Join-Path $dataRoot 'secrets\backup-encryption.secret'
$pgBin = Join-Path $installRoot 'postgresql\bin'
$java = Join-Path $installRoot 'runtime\bin\java.exe'

function Read-Property([string]$Name) {
    $line = Get-Content $configPath | Where-Object { $_ -like "$Name=*" } | Select-Object -Last 1
    if (-not $line) { throw "Configuration property $Name is missing." }
    return $line.Substring($Name.Length + 1).Replace('\=', '=').Replace('\:', ':').Replace('\\', '\')
}

$picker = [Windows.Forms.OpenFileDialog]::new()
$picker.Title = 'Choose a Radiance POS backup to restore'
$picker.InitialDirectory = Join-Path $dataRoot 'backups'
$picker.Filter = 'Radiance POS backups (*.dump;*.dump.enc)|*.dump;*.dump.enc|All files (*.*)|*.*'
if ($picker.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { exit 0 }
$source = $picker.FileName
$choice = [System.Windows.MessageBox]::Show(
    "This replaces the current POS database with:`n`n$source`n`nA safety backup of the current database will be made first. Continue?",
    'Restore Radiance POS backup', 'YesNo', 'Warning')
if ($choice -ne 'Yes') { exit 0 }

$dbPassword = Read-Property 'spring.datasource.password'
$env:PGPASSWORD = $dbPassword
$backupDir = Join-Path $dataRoot 'backups'
$safety = Join-Path $backupDir ("pre-restore-{0}.dump" -f (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
$restoreFile = $source
$temporary = $null
try {
    Stop-Service RadiancePos -ErrorAction Stop
    & (Join-Path $pgBin 'pg_dump.exe') --host=127.0.0.1 --port=54329 --username=giftedlabs --dbname=pos_system --format=custom --no-password "--file=$safety"
    if ($LASTEXITCODE -ne 0) { throw 'The safety backup failed; the restore was not started.' }
    if ($source.EndsWith('.enc', [StringComparison]::OrdinalIgnoreCase)) {
        if (-not (Test-Path $backupKey)) { throw 'The backup decryption key is missing.' }
        $temporary = Join-Path $env:TEMP ("radiance-restore-{0}.dump" -f [guid]::NewGuid())
        & $java (Join-Path $PSScriptRoot 'DecryptBackup.java') $source $temporary $backupKey
        if ($LASTEXITCODE -ne 0) { throw 'The encrypted backup could not be decrypted.' }
        $restoreFile = $temporary
    }
    & (Join-Path $pgBin 'pg_restore.exe') --host=127.0.0.1 --port=54329 --username=giftedlabs --dbname=pos_system --clean --if-exists --single-transaction --no-password $restoreFile
    if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed. The single transaction left the previous database unchanged.' }
    Start-Service RadiancePos
    $healthy = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            if ((Invoke-RestMethod 'http://127.0.0.1:8080/actuator/health' -TimeoutSec 2).status -eq 'UP') { $healthy = $true; break }
        } catch { }
        Start-Sleep 2
    }
    if (-not $healthy) { throw 'The database restored, but Radiance POS did not become healthy. Run Diagnostics before trading.' }
    [System.Windows.MessageBox]::Show("Restore completed successfully.`n`nSafety backup: $safety", 'Radiance POS restore', 'OK', 'Information') | Out-Null
} catch {
    Start-Service RadiancePos -ErrorAction SilentlyContinue
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'Radiance POS restore failed', 'OK', 'Error') | Out-Null
    throw
} finally {
    if ($temporary) { Remove-Item $temporary -Force -ErrorAction SilentlyContinue }
}
