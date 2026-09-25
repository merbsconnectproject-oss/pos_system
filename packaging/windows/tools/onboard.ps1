[CmdletBinding()]
param(
    [string]$ConfigFile,
    [switch]$NoLaunch,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

# The transcript opens before anything else can throw — including before strict
# mode is armed. Setup has now twice failed in a way that left nothing behind to
# read, and a log that starts on line three cannot record a failure on line two.
$DataRoot = Join-Path $env:ProgramData 'GiftedLabs\Radiance POS'
$script:LogPath = Join-Path $DataRoot ('logs\onboarding-{0:yyyyMMdd-HHmmss}.log' -f (Get-Date))
try {
    New-Item -ItemType Directory -Force (Split-Path $script:LogPath -Parent) | Out-Null
    Start-Transcript -Path $script:LogPath -Force | Out-Null
} catch { }

Set-StrictMode -Version Latest

$InstallRoot = Split-Path $PSScriptRoot -Parent
$ConfigRoot = Join-Path $DataRoot 'config'
$ConfigPath = Join-Path $ConfigRoot 'application.properties'
$SecretsRoot = Join-Path $DataRoot 'secrets'
$PostgresAdminSecretPath = Join-Path $SecretsRoot 'postgres-admin.secret'
$BackupEncryptionSecretPath = Join-Path $SecretsRoot 'backup-encryption.secret'
$PgData = Join-Path $DataRoot 'postgres-data'
$PgLog = Join-Path $DataRoot 'logs\postgresql.log'
$PgBin = Join-Path $InstallRoot 'postgresql\bin'
$ServiceExe = Join-Path $InstallRoot 'service\RadiancePosService.exe'
$HealthUrl = 'http://127.0.0.1:8080/actuator/health'
$PgPort = 54329
$script:ProgressForm = $null
$script:ProgressLabel = $null

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function New-RandomSecret([int]$Length = 40) {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes = [byte[]]::new($Length)
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}

function New-BackupEncryptionKey {
    $bytes = [byte[]]::new(32)
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function ConvertTo-PropertyValue([AllowNull()][string]$Value) {
    if ($null -eq $Value) { return '' }
    return $Value.Replace('\', '\\').Replace("`r", '').Replace("`n", '\n').Replace(':', '\:').Replace('=', '\=')
}

function Assert-Configuration($Config) {
    $errors = [Collections.Generic.List[string]]::new()
    if ([string]::IsNullOrWhiteSpace($Config.ownerUsername) -or $Config.ownerUsername -notmatch '^[A-Za-z0-9._-]{3,40}$') {
        $errors.Add('Owner username must be 3-40 letters, numbers, dots, dashes, or underscores.')
    }
    if ([string]::IsNullOrWhiteSpace($Config.ownerName)) { $errors.Add('Owner full name is required.') }
    if ([string]::IsNullOrEmpty($Config.ownerPassword) -or $Config.ownerPassword.Length -lt 8) { $errors.Add('Owner password must be at least 8 characters.') }
    if ($Config.ownerPassword -ne $Config.ownerPasswordConfirm) { $errors.Add('Owner passwords do not match.') }
    if ($Config.ownerPin -notmatch '^\d{4,6}$') { $errors.Add('Owner PIN must contain 4 to 6 digits.') }
    if ($Config.ownerPin -ne $Config.ownerPinConfirm) { $errors.Add('Owner PINs do not match.') }
    if ($Config.ownerEmail -and $Config.ownerEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { $errors.Add('Owner email address is not valid.') }
    if ($Config.outletCode -notmatch '^[A-Za-z0-9]{2,6}$') { $errors.Add('Outlet code must be 2-6 letters or numbers, with no spaces or dashes.') }
    if ([string]::IsNullOrWhiteSpace($Config.outletName)) { $errors.Add('Outlet name is required.') }
    if ($Config.terminalCode -notmatch '^[A-Za-z0-9]{1,6}$') { $errors.Add('Terminal code must be 1-6 letters or numbers, with no spaces or dashes.') }
    if ($Config.offsiteEnabled) {
        foreach ($field in 'offsiteEndpoint', 'offsiteBucket', 'offsiteAccessKey', 'offsiteSecretKey') {
            if ([string]::IsNullOrWhiteSpace($Config.$field)) { $errors.Add("Off-site backup requires $field.") }
        }
        if ($Config.offsiteEndpoint -and $Config.offsiteEndpoint -notmatch '^https://') { $errors.Add('Off-site endpoint must use HTTPS.') }
    }
    if ($errors.Count) { throw ($errors -join "`n") }
}

function Get-InteractiveConfiguration {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()

    $form = [Windows.Forms.Form]::new()
    $form.Text = 'Radiance POS - First-run setup'
    $form.Size = [Drawing.Size]::new(690, 610)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false

    $title = [Windows.Forms.Label]::new()
    $title.Text = 'Set up this counter'
    $title.Font = [Drawing.Font]::new('Segoe UI', 18, [Drawing.FontStyle]::Bold)
    $title.SetBounds(24, 18, 620, 38)
    $form.Controls.Add($title)

    $tabs = [Windows.Forms.TabControl]::new()
    $tabs.SetBounds(20, 68, 640, 430)
    $form.Controls.Add($tabs)

    function Add-Field($Page, [string]$Label, [int]$Y, [bool]$Secret = $false, [string]$Default = '') {
        $labelControl = [Windows.Forms.Label]::new()
        $labelControl.Text = $Label
        $labelControl.SetBounds(28, $Y + 4, 190, 24)
        $Page.Controls.Add($labelControl)
        $input = [Windows.Forms.TextBox]::new()
        $input.SetBounds(225, $Y, 350, 27)
        $input.Text = $Default
        $input.UseSystemPasswordChar = $Secret
        $Page.Controls.Add($input)
        return $input
    }

    $ownerPage = [Windows.Forms.TabPage]::new('1. Owner')
    $tabs.TabPages.Add($ownerPage)
    $ownerHelp = [Windows.Forms.Label]::new()
    $ownerHelp.Text = 'Create the first owner. The password and PIN are used once, hashed, and removed from setup files.'
    $ownerHelp.SetBounds(28, 20, 565, 40)
    $ownerPage.Controls.Add($ownerHelp)
    $ownerUsername = Add-Field $ownerPage 'Username' 72 $false 'admin'
    $ownerName = Add-Field $ownerPage 'Full name' 112 $false 'System Administrator'
    $ownerEmail = Add-Field $ownerPage 'Email (optional)' 152
    $ownerPassword = Add-Field $ownerPage 'Password (8+ characters)' 192 $true
    $ownerPasswordConfirm = Add-Field $ownerPage 'Confirm password' 232 $true
    $ownerPin = Add-Field $ownerPage 'Approval PIN (4-6 digits)' 272 $true
    $ownerPinConfirm = Add-Field $ownerPage 'Confirm PIN' 312 $true

    $shopPage = [Windows.Forms.TabPage]::new('2. Shop')
    $tabs.TabPages.Add($shopPage)
    $shopHelp = [Windows.Forms.Label]::new()
    $shopHelp.Text = 'The installer creates the first outlet and Counter 1. Codes appear in receipt numbers.'
    $shopHelp.SetBounds(28, 20, 565, 40)
    $shopPage.Controls.Add($shopHelp)
    $outletCode = Add-Field $shopPage 'Outlet code' 86 $false 'RAD'
    $outletName = Add-Field $shopPage 'Outlet name' 126 $false 'Radiance Lighting'
    $terminalCode = Add-Field $shopPage 'Terminal code' 166 $false '01'

    $backupPage = [Windows.Forms.TabPage]::new('3. Protection')
    $tabs.TabPages.Add($backupPage)
    $backupHelp = [Windows.Forms.Label]::new()
    $backupHelp.Text = 'Local backups run every 15 minutes. Add an S3-compatible bucket now for protection against disk loss, or configure it later in Settings.'
    $backupHelp.SetBounds(28, 18, 565, 52)
    $backupPage.Controls.Add($backupHelp)
    $offsiteEnabled = [Windows.Forms.CheckBox]::new()
    $offsiteEnabled.Text = 'Configure off-site backup now'
    $offsiteEnabled.SetBounds(28, 76, 300, 25)
    $backupPage.Controls.Add($offsiteEnabled)
    $offsiteEndpoint = Add-Field $backupPage 'HTTPS endpoint' 116
    $offsiteBucket = Add-Field $backupPage 'Bucket' 156
    $offsiteAccess = Add-Field $backupPage 'Access key ID' 196
    $offsiteSecret = Add-Field $backupPage 'Secret access key' 236 $true
    $offsiteRegion = Add-Field $backupPage 'Region' 276 $false 'auto'
    $offsitePrefix = Add-Field $backupPage 'Prefix (optional)' 316
    $backupInputs = @($offsiteEndpoint, $offsiteBucket, $offsiteAccess, $offsiteSecret, $offsiteRegion, $offsitePrefix)
    $backupInputs | ForEach-Object { $_.Enabled = $false }
    $offsiteEnabled.Add_CheckedChanged({ $backupInputs | ForEach-Object { $_.Enabled = $offsiteEnabled.Checked } })

    $back = [Windows.Forms.Button]::new()
    $back.Text = 'Back'
    $back.SetBounds(388, 515, 82, 32)
    $back.Enabled = $false
    $form.Controls.Add($back)
    $next = [Windows.Forms.Button]::new()
    $next.Text = 'Next'
    $next.SetBounds(478, 515, 82, 32)
    $form.Controls.Add($next)
    $install = [Windows.Forms.Button]::new()
    $install.Text = 'Install'
    $install.SetBounds(568, 515, 82, 32)
    $install.Visible = $false
    $form.Controls.Add($install)

    $tabs.Add_SelectedIndexChanged({
        $back.Enabled = $tabs.SelectedIndex -gt 0
        $next.Visible = $tabs.SelectedIndex -lt ($tabs.TabPages.Count - 1)
        $install.Visible = -not $next.Visible
    })
    $back.Add_Click({ if ($tabs.SelectedIndex -gt 0) { $tabs.SelectedIndex-- } })
    $next.Add_Click({ if ($tabs.SelectedIndex -lt $tabs.TabPages.Count - 1) { $tabs.SelectedIndex++ } })
    $install.Add_Click({
        $candidate = [pscustomobject]@{
            ownerUsername = $ownerUsername.Text.Trim(); ownerName = $ownerName.Text.Trim(); ownerEmail = $ownerEmail.Text.Trim()
            ownerPassword = $ownerPassword.Text; ownerPasswordConfirm = $ownerPasswordConfirm.Text
            ownerPin = $ownerPin.Text; ownerPinConfirm = $ownerPinConfirm.Text
            outletCode = $outletCode.Text.Trim().ToUpperInvariant(); outletName = $outletName.Text.Trim(); terminalCode = $terminalCode.Text.Trim().ToUpperInvariant()
            offsiteEnabled = $offsiteEnabled.Checked; offsiteEndpoint = $offsiteEndpoint.Text.Trim().TrimEnd('/'); offsiteBucket = $offsiteBucket.Text.Trim()
            offsiteAccessKey = $offsiteAccess.Text.Trim(); offsiteSecretKey = $offsiteSecret.Text
            offsiteRegion = $offsiteRegion.Text.Trim(); offsitePrefix = $offsitePrefix.Text.Trim().Trim('/')
        }
        try { Assert-Configuration $candidate }
        catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Check setup details', 'OK', 'Warning') | Out-Null; return }
        $form.Tag = $candidate
        $form.DialogResult = [Windows.Forms.DialogResult]::OK
        $form.Close()
    })
    # Null, not an exception. Cancelling is a decision, and reporting it back as
    # a setup failure put an error dialog in front of somebody who had just said
    # "not now".
    if ($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { return $null }
    return $form.Tag
}

function Start-SetupProgress {
    if ($ConfigFile) { return }
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $script:ProgressForm = [Windows.Forms.Form]::new()
    $script:ProgressForm.Text = 'Installing Radiance POS'
    $script:ProgressForm.Size = [Drawing.Size]::new(520, 155)
    $script:ProgressForm.StartPosition = 'CenterScreen'
    $script:ProgressForm.FormBorderStyle = 'FixedDialog'
    $script:ProgressForm.ControlBox = $false
    $script:ProgressLabel = [Windows.Forms.Label]::new()
    $script:ProgressLabel.SetBounds(24, 22, 455, 28)
    $script:ProgressForm.Controls.Add($script:ProgressLabel)
    $bar = [Windows.Forms.ProgressBar]::new()
    $bar.Style = 'Marquee'
    $bar.MarqueeAnimationSpeed = 24
    $bar.SetBounds(24, 62, 455, 24)
    $script:ProgressForm.Controls.Add($bar)
    $script:ProgressForm.Show()
    [Windows.Forms.Application]::DoEvents()
}

function Set-SetupStatus([string]$Status) {
    if ($ConfigFile) { Write-Host $Status; return }
    $script:ProgressLabel.Text = $Status
    [Windows.Forms.Application]::DoEvents()
}

function Invoke-Checked([string]$File, [string[]]$Arguments, [hashtable]$Environment = @{}) {
    foreach ($entry in $Environment.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process') }
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE." }
}

function Invoke-IcaclsChecked([string]$Context, [string[]]$Arguments) {
    $output = & icacls.exe @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $summary = [regex]::Match(($output -join "`n"), 'Failed processing (\d+) files')
    if ($exitCode -ne 0 -or ($summary.Success -and $summary.Groups[1].Value -ne '0')) {
        $failed = if ($summary.Success) { $summary.Groups[1].Value } else { 'one or more' }
        throw "Setup could not apply Windows permissions to $failed item(s) in $Context."
    }
}

function Wait-ServiceReady([string]$Name, [int]$Seconds = 60) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        $service = Get-Service $Name -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq 'Running') { return }
        Start-Sleep 1
    } while ((Get-Date) -lt $deadline)
    throw "Windows service $Name did not start within $Seconds seconds."
}

# Five minutes, not two. The first start of a counter applies every migration
# before it answers a health check, and the launcher already learned this the
# expensive way: ninety seconds expired in the middle of a migration run and
# told the operator the till was broken.
function Wait-Application([int]$Seconds = 300) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            $health = Invoke-RestMethod $HealthUrl -TimeoutSec 3
            if ($health.status -eq 'UP') { return }
        } catch { }
        Start-Sleep 2
    } while ((Get-Date) -lt $deadline)
    throw 'Radiance POS did not become healthy. Run Radiance POS Diagnostics from the Start menu.'
}

function Set-DataPermissions {
    Invoke-IcaclsChecked 'the Radiance POS data directory' @($DataRoot, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-19:RX', '*S-1-5-20:RX', '/C')
    Invoke-IcaclsChecked 'the application configuration' @($ConfigRoot, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-19:(OI)(CI)RX', '/T', '/C')
    foreach ($writable in (Join-Path $DataRoot 'backups'), (Join-Path $DataRoot 'logs')) {
        Invoke-IcaclsChecked $writable @($writable, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-19:(OI)(CI)M', '*S-1-5-20:(OI)(CI)M', '/T', '/C')
    }
    Invoke-IcaclsChecked 'the PostgreSQL cluster' @($PgData, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-20:(OI)(CI)F', '/T', '/C')
    Invoke-IcaclsChecked 'the protected secrets directory' @($SecretsRoot, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '/T', '/C')
}

function Read-Secret([string]$Path, [string]$Name) {
    # Returns $null when there is nothing to reuse, and throws only when there
    # is something there that cannot be read. Those are different situations and
    # the second one used to arrive as a bare "access is denied" from whichever
    # cmdlet hit it first, with nothing saying which file or what to do.
    if (-not (Test-Path $Path)) { return $null }
    if (Test-Path $Path -PathType Container) {
        throw ("$Path is a folder, and the $Name belongs in a file of that name. " +
               "Run 'Reset this counter before setup' from the Start menu, then set up again.")
    }
    try {
        try { Set-ItemProperty -LiteralPath $Path -Name Attributes -Value 'Normal' } catch { }
        return (Get-Content -Raw -LiteralPath $Path).Trim()
    } catch {
        throw ("Setup cannot read the $Name it saved on an earlier attempt: $Path`n`n" +
               "$($_.Exception.Message)`n`n" +
               "The database it belongs to cannot be opened without it, so this counter has " +
               "to start over. Run 'Reset this counter before setup' from the Start menu, " +
               'then set up again. No sales have been recorded yet.')
    }
}

function Save-Secret([string]$Path, [string]$Value) {
    # Setup runs elevated and is the only writer here, so a denial means
    # something left the file or its folder in a state an administrator cannot
    # write to: a read-only attribute, a folder where a file belongs, or an ACL
    # from an interrupted attempt that no longer carries Administrators. Setup
    # can repair all three, and a shop should not be stopped at the counter by
    # any of them.
    $folder = Split-Path $Path -Parent
    New-Item -ItemType Directory -Force $folder | Out-Null
    try {
        [IO.File]::WriteAllText($Path, $Value, [Text.UTF8Encoding]::new($false))
        return
    } catch [System.UnauthorizedAccessException] {
        Write-Host "Windows refused to write $Path. Repairing its permissions and trying once more."
    }

    if (Test-Path $Path -PathType Container) {
        throw "$Path is a folder where a file belongs. Delete it and run 'Configure or repair Radiance POS' again."
    }
    # Errors are swallowed on purpose: the retry below is the real test of
    # whether this worked, and its message is the one worth reading.
    try { & takeown.exe /F $folder /R /D Y 2>&1 | Out-Null } catch { }
    try { & icacls.exe $folder '/grant' '*S-1-5-32-544:(OI)(CI)F' '/T' '/C' 2>&1 | Out-Null } catch { }
    if (Test-Path $Path) {
        try { Set-ItemProperty -LiteralPath $Path -Name IsReadOnly -Value $false } catch { }
    }

    try {
        [IO.File]::WriteAllText($Path, $Value, [Text.UTF8Encoding]::new($false))
    } catch [System.UnauthorizedAccessException] {
        throw ("Windows refused to write $Path even after setup repaired the folder's permissions. " +
               'Anti-virus or ransomware protection blocking the folder is the usual cause. ' +
               "Allow $folder, or delete it, and run 'Configure or repair Radiance POS' again.")
    }
}

function Start-PostgresService {
    try {
        Start-Service RadiancePosPostgreSQL
        return
    } catch {
        $reason = $_.Exception.Message
    }

    # "Failed to start service" is everything Start-Service knows and nothing an
    # operator can act on. PostgreSQL writes the actual reason — a port already
    # taken, a data directory it cannot read, a lock file from a crash — to its
    # own log, so that is what goes in the message.
    $detail = @()
    if (Test-Path $PgLog) { $detail += (Get-Content -Tail 15 $PgLog) }
    $stray = Join-Path $PgData 'postmaster.pid'
    if (Test-Path $stray) {
        $detail += "A lock file from an earlier run is still present: $stray"
    }
    $listener = Get-NetTCPConnection -LocalPort $PgPort -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($listener) {
        $owner = (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        $detail += "Port $PgPort is already in use by $owner (process $($listener.OwningProcess))."
    }

    throw ("The private PostgreSQL service would not start.`n`n$reason`n`n" +
           $(if ($detail) { ($detail -join "`n") } else { "Nothing was written to $PgLog." }))
}

function Initialize-Database([string]$SuperPassword, [string]$DatabasePassword) {
    foreach ($tool in 'initdb.exe', 'pg_ctl.exe', 'psql.exe', 'createdb.exe') {
        if (-not (Test-Path (Join-Path $PgBin $tool))) { throw "PostgreSQL tool is missing: $tool" }
    }
    New-Item -ItemType Directory -Force $DataRoot, (Join-Path $DataRoot 'logs') | Out-Null
    if (-not (Test-Path (Join-Path $PgData 'PG_VERSION'))) {
        New-Item -ItemType Directory -Force $PgData | Out-Null
        $passwordFile = Join-Path $env:TEMP ("radiance-pg-{0}.txt" -f [guid]::NewGuid())
        try {
            [IO.File]::WriteAllText($passwordFile, $SuperPassword, [Text.UTF8Encoding]::new($false))
            Invoke-Checked (Join-Path $PgBin 'initdb.exe') @('-D', $PgData, '-U', 'postgres', '--pwfile', $passwordFile, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--locale=C')
        } finally { Remove-Item $passwordFile -Force -ErrorAction SilentlyContinue }
        Add-Content (Join-Path $PgData 'postgresql.conf') "`nlisten_addresses = '127.0.0.1'`nport = $PgPort`npassword_encryption = 'scram-sha-256'`n"
    }
    $postgresConfig = Join-Path $PgData 'postgresql.conf'
    if (-not (Select-String -LiteralPath $postgresConfig -SimpleMatch '# Radiance POS managed logging' -Quiet)) {
        Add-Content $postgresConfig "`n# Radiance POS managed logging`nlogging_collector = on`nlog_destination = 'stderr'`nlog_directory = '../logs'`nlog_filename = 'postgresql.log'`n"
    }
    # The cluster is opened by the service a few lines below, and
    # Set-DataPermissions does not run until the configuration is written — so
    # until now the data directory was started with whatever it happened to
    # inherit from ProgramData. On a counter whose data root was already locked
    # down by an earlier attempt, that is how PostgreSQL came to be refused its
    # own postmaster.pid. The grant belongs with the cluster that needs it, not
    # at the end of setup.
    #
    # PostgreSQL must run as the account that owns its cluster. The interactive
    # administrator necessarily runs initdb, but the long-lived service uses the
    # built-in, low-privilege NetworkService identity. Transfer ownership before
    # the first service start and retain Administrators for repair operations.
    # LocalSystem used to be granted access without becoming the owner; that is
    # not the ownership model PostgreSQL requires and failed on clean counters.
    & takeown.exe /F $PgData /R /A /D Y 2>&1 | Out-Null
    $owned = & icacls.exe $PgData '/setowner' '*S-1-5-20' '/T' '/C' 2>&1
    $ownerExit = $LASTEXITCODE
    $ownerSummary = [regex]::Match(($owned -join "`n"), 'Failed processing (\d+) files')
    if ($ownerExit -ne 0 -or ($ownerSummary.Success -and $ownerSummary.Groups[1].Value -ne '0')) {
        throw 'Setup could not assign the database cluster to its Windows service account. Run Reset this counter before setup, then try again.'
    }
    $granted = & icacls.exe $PgData '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-20:(OI)(CI)F' '/T' '/C' 2>&1
    $grantExit = $LASTEXITCODE
    # Native-command output is an array of lines. PowerShell only fills its
    # automatic $Matches variable when the left side of -match is a scalar, so
    # using it here fails under StrictMode before setup can report the ACL
    # result. Parse the joined output explicitly instead.
    $grantSummary = [regex]::Match(($granted -join "`n"), 'Failed processing (\d+) files')
    if ($grantExit -ne 0 -or ($grantSummary.Success -and $grantSummary.Groups[1].Value -ne '0')) {
        $failedFiles = if ($grantSummary.Success) { $grantSummary.Groups[1].Value } else { 'one or more' }
        throw ("Setup could not set permissions on $failedFiles files in the database directory, " +
               "so PostgreSQL would not be able to open it.`n`n" +
               "This cluster was created by a different Windows account and cannot be repaired from here. " +
               "Run 'Reset this counter before setup' from the Start menu, then set up again. " +
               'No sales have been recorded yet.')
    }
    # NetworkService must also be able to traverse the protected data root and
    # create the collector log before PostgreSQL starts for the first time.
    Invoke-IcaclsChecked 'the Radiance POS data directory' @($DataRoot, '/grant:r', '*S-1-5-20:RX', '/C')
    Invoke-IcaclsChecked 'the PostgreSQL log directory' @((Join-Path $DataRoot 'logs'), '/grant:r', '*S-1-5-20:(OI)(CI)M', '/T', '/C')

    # A registration left by an earlier install points at whatever data directory
    # it was given then. Setup used to keep any service it found, so a stale or
    # disabled one was inherited silently and then failed to start with nothing
    # said about why. Re-register unless the existing one is this cluster.
    $existing = Get-Service RadiancePosPostgreSQL -ErrorAction SilentlyContinue
    if ($existing) {
        $serviceInfo = Get-CimInstance Win32_Service -Filter "Name='RadiancePosPostgreSQL'"
        $binary = $serviceInfo.PathName
        $wrongAccount = $serviceInfo.StartName -notmatch '(?i)^NT AUTHORITY\\Network ?Service$'
        if ($binary -notlike "*$PgData*" -or $wrongAccount) {
            Write-Host 'The PostgreSQL service has stale settings; re-registering it.'
            Stop-Service RadiancePosPostgreSQL -Force -ErrorAction SilentlyContinue
            & (Join-Path $PgBin 'pg_ctl.exe') unregister -N RadiancePosPostgreSQL 2>&1 | Out-Null
            $existing = $null
        } elseif ($existing.StartType -eq 'Disabled') {
            # Disabling these is the standard way to clear a failed attempt, and
            # a disabled service refuses to start however healthy the cluster is.
            Write-Host 'The PostgreSQL service was disabled; setting it back to automatic.'
            Set-Service RadiancePosPostgreSQL -StartupType Automatic
        }
    }
    if (-not $existing) {
        # -l is ignored by pg_ctl's Windows register mode. PostgreSQL's logging
        # collector above writes the durable file, while -e gives very-early
        # service failures a distinct Windows event source.
        Invoke-Checked (Join-Path $PgBin 'pg_ctl.exe') @('register', '-N', 'RadiancePosPostgreSQL', '-D', $PgData, '-S', 'auto', '-U', 'NT AUTHORITY\NetworkService', '-e', 'RadiancePosPostgreSQL')
    }
    Start-PostgresService
    Wait-ServiceReady RadiancePosPostgreSQL
    $pgEnv = @{ PGPASSWORD = $SuperPassword }
    $env:PGPASSWORD = $SuperPassword
    $roleExists = & (Join-Path $PgBin 'psql.exe') -h 127.0.0.1 -p $PgPort -U postgres -d postgres -tAc "select 1 from pg_roles where rolname='giftedlabs'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not connect to the private PostgreSQL instance.' }
    if (-not ($roleExists -match '1')) {
        Invoke-Checked (Join-Path $PgBin 'psql.exe') @('-h', '127.0.0.1', '-p', "$PgPort", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE ROLE giftedlabs LOGIN PASSWORD '$DatabasePassword'") $pgEnv
    } else {
        Invoke-Checked (Join-Path $PgBin 'psql.exe') @('-h', '127.0.0.1', '-p', "$PgPort", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "ALTER ROLE giftedlabs PASSWORD '$DatabasePassword'") $pgEnv
    }
    $dbExists = & (Join-Path $PgBin 'psql.exe') -h 127.0.0.1 -p $PgPort -U postgres -d postgres -tAc "select 1 from pg_database where datname='pos_system'"
    if (-not ($dbExists -match '1')) {
        Invoke-Checked (Join-Path $PgBin 'createdb.exe') @('-h', '127.0.0.1', '-p', "$PgPort", '-U', 'postgres', '-O', 'giftedlabs', 'pos_system') $pgEnv
    }
}

function Write-ApplicationConfiguration($Config, [string]$DatabasePassword, [string]$BackupEncryptionKey, [bool]$IncludeBootstrap) {
    New-Item -ItemType Directory -Force $ConfigRoot, (Join-Path $DataRoot 'backups'), (Join-Path $DataRoot 'logs') | Out-Null
    $properties = [Collections.Generic.List[string]]::new()
    $properties.Add('spring.profiles.active=counter')
    $properties.Add("spring.datasource.url=jdbc\:postgresql\://127.0.0.1\:$PgPort/pos_system")
    $properties.Add('spring.datasource.username=giftedlabs')
    $properties.Add("spring.datasource.password=$(ConvertTo-PropertyValue $DatabasePassword)")
    $properties.Add('server.address=127.0.0.1')
    $properties.Add('server.port=8080')
    $properties.Add("pos.deployment.outlet-code=$(ConvertTo-PropertyValue $Config.outletCode)")
    $properties.Add("pos.deployment.terminal-code=$(ConvertTo-PropertyValue $Config.terminalCode)")
    $properties.Add("pos.backup.directory=$(ConvertTo-PropertyValue (Join-Path $DataRoot 'backups'))")
    $properties.Add("pos.backup.pg-dump=$(ConvertTo-PropertyValue (Join-Path $PgBin 'pg_dump.exe'))")
    if ($Config.offsiteEnabled) {
        $properties.Add("POS_BACKUP_ENCRYPTION_KEY=$(ConvertTo-PropertyValue $BackupEncryptionKey)")
        $properties.Add("pos.backup.offsite.endpoint=$(ConvertTo-PropertyValue $Config.offsiteEndpoint)")
        $properties.Add("pos.backup.offsite.bucket=$(ConvertTo-PropertyValue $Config.offsiteBucket)")
        $properties.Add("pos.backup.offsite.access-key-id=$(ConvertTo-PropertyValue $Config.offsiteAccessKey)")
        $properties.Add("pos.backup.offsite.secret-access-key=$(ConvertTo-PropertyValue $Config.offsiteSecretKey)")
        $properties.Add("pos.backup.offsite.region=$(ConvertTo-PropertyValue $Config.offsiteRegion)")
        $properties.Add("pos.backup.offsite.prefix=$(ConvertTo-PropertyValue $Config.offsitePrefix)")
    }
    $properties.Add("pos.bootstrap.enabled=$($IncludeBootstrap.ToString().ToLowerInvariant())")
    if ($IncludeBootstrap) {
        $properties.Add("pos.bootstrap.username=$(ConvertTo-PropertyValue $Config.ownerUsername)")
        $properties.Add("pos.bootstrap.full-name=$(ConvertTo-PropertyValue $Config.ownerName)")
        $properties.Add("pos.bootstrap.email=$(ConvertTo-PropertyValue $Config.ownerEmail)")
        $properties.Add("pos.bootstrap.password=$(ConvertTo-PropertyValue $Config.ownerPassword)")
        $properties.Add("pos.bootstrap.pin=$(ConvertTo-PropertyValue $Config.ownerPin)")
        $properties.Add("pos.bootstrap.outlet-code=$(ConvertTo-PropertyValue $Config.outletCode)")
        $properties.Add("pos.bootstrap.outlet-name=$(ConvertTo-PropertyValue $Config.outletName)")
        $properties.Add("pos.bootstrap.terminal-code=$(ConvertTo-PropertyValue $Config.terminalCode)")
        $properties.Add('pos.bootstrap.terminal-name=Counter 1')
    }
    [IO.File]::WriteAllLines($ConfigPath, $properties, [Text.UTF8Encoding]::new($false))
    Set-DataPermissions
}

function Install-ApplicationService {
    if (-not (Test-Path $ServiceExe)) { throw 'Radiance POS service wrapper is missing.' }

    # The same hole the PostgreSQL service had: setup kept whatever registration
    # it found. One left by an earlier install points at the wrapper that
    # installed it, and one left disabled — which is how a failed attempt is
    # normally cleared — refuses to start with nothing saying why.
    $existing = Get-Service RadiancePos -ErrorAction SilentlyContinue
    if ($existing) {
        $binary = (Get-CimInstance Win32_Service -Filter "Name='RadiancePos'").PathName
        if ($binary -notlike "*$ServiceExe*") {
            Write-Host 'The Radiance POS service points at a different install; re-registering it.'
            Stop-Service RadiancePos -Force -ErrorAction SilentlyContinue
            & $ServiceExe uninstall 2>&1 | Out-Null
            Start-Sleep 2
            $existing = $null
        } elseif ($existing.StartType -eq 'Disabled') {
            Write-Host 'The Radiance POS service was disabled; setting it back to automatic.'
            Set-Service RadiancePos -StartupType Automatic
        }
    }
    if (-not $existing) { Invoke-Checked $ServiceExe @('install') }

    Start-Service RadiancePos
    Wait-ServiceReady RadiancePos
}

function Assert-PortAvailable {
    # The application binds 8080 and nothing else on the counter may hold it.
    # Without this the only symptom is "did not become healthy" five minutes
    # later, which describes every other cause equally well.
    $held = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $held) { return }
    $owner = Get-Process -Id $held.OwningProcess -ErrorAction SilentlyContinue
    if ($owner -and $owner.Path -like "*Radiance POS*") { return }
    throw ("Another program is already using port 8080 on this computer: " +
           "$(if ($owner) { "$($owner.ProcessName) (process $($held.OwningProcess))" } else { "process $($held.OwningProcess)" }).`n`n" +
           'Radiance POS needs that port. Close that program and run setup again.')
}

function Show-SetupFailure([string]$Message) {
    if ($script:ProgressForm) { try { $script:ProgressForm.Close() } catch { } }
    if ($ConfigFile) { Write-Error $Message; return }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "$Message`n`nYour sales data was not deleted. Run 'Configure or repair Radiance POS' from the Start menu to try again.`n`nA full log is at $script:LogPath",
        'Radiance POS setup', 'OK', 'Error') | Out-Null
}

# Everything below runs with no console attached — the shortcuts launch this
# through wscript so nothing flashes on the counter screen. That makes an
# unhandled error completely invisible: setup appeared to do nothing at all.
# So every step is inside one try, every failure puts up a dialog, and the whole
# run is transcribed to a file the diagnostics tool can pick up.
try {
    if (-not (Test-Administrator)) {
        throw 'Radiance POS setup did not receive administrator rights. Answer Yes to the Windows permission prompt when it appears, or sign in to an administrator account.'
    }

    $configuration = if ($ConfigFile) {
        if (-not (Test-Path $ConfigFile)) { throw "The onboarding response file was not found at $ConfigFile." }
        Get-Content -Raw $ConfigFile | ConvertFrom-Json
    } else {
        Get-InteractiveConfiguration
    }
    # A cancelled wizard is not a failure. Nothing has been written yet, so it
    # leaves quietly rather than accusing the operator of an error.
    if ($null -eq $configuration) { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null; exit 0 }

    Assert-Configuration $configuration
    if ($ValidateOnly) {
        Write-Host 'Onboarding configuration is valid.'
        Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
        exit 0
    }

    $databasePassword = New-RandomSecret
    # Reused when an earlier attempt already saved them: the cluster was
    # initialised with that superuser password and cannot be opened with another.
    $existingPostgres = Read-Secret $PostgresAdminSecretPath 'PostgreSQL administrator password'
    $postgresPassword = if ($existingPostgres) { $existingPostgres } else { New-RandomSecret }
    $existingBackupKey = Read-Secret $BackupEncryptionSecretPath 'backup encryption key'
    $backupEncryptionKey = if ($existingBackupKey) { $existingBackupKey } else { New-BackupEncryptionKey }

    Start-SetupProgress
    Set-SetupStatus 'Initializing the private database...'
    Initialize-Database $postgresPassword $databasePassword
    Save-Secret $PostgresAdminSecretPath $postgresPassword
    Save-Secret $BackupEncryptionSecretPath $backupEncryptionKey
    Assert-PortAvailable
    Set-SetupStatus 'Securing configuration and creating the Windows service...'
    Write-ApplicationConfiguration $configuration $databasePassword $backupEncryptionKey $true
    Install-ApplicationService
    Set-SetupStatus 'Applying database migrations and creating the first owner...'
    Wait-Application

    # The plaintext first-owner password and PIN exist only for the bootstrap
    # start. After the hashes are committed, remove both and prove the app can
    # restart without them.
    Stop-Service RadiancePos
    Write-ApplicationConfiguration $configuration $databasePassword $backupEncryptionKey $false
    Start-Service RadiancePos
    Set-SetupStatus 'Verifying the protected installation...'
    Wait-Application

    $state = [ordered]@{
        configuredAt = (Get-Date).ToUniversalTime().ToString('o')
        outletCode = $configuration.outletCode
        terminalCode = $configuration.terminalCode
        databasePort = $PgPort
        offsiteBackupConfigured = [bool]$configuration.offsiteEnabled
    }
    $state | ConvertTo-Json | Set-Content (Join-Path $DataRoot 'install-state.json') -Encoding UTF8
    if ($script:ProgressForm) { $script:ProgressForm.Close() }
    if (-not $NoLaunch) {
        # Through the same console-free shim the shortcuts use.
        Start-Process 'wscript.exe' -ArgumentList @(
            (Join-Path $InstallRoot 'tools\launch.vbs'), 'open-pos.ps1'
        )
    }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Radiance POS is installed, protected, and ready to use.', 'Setup complete', 'OK', 'Information') | Out-Null
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
} catch {
    Show-SetupFailure "Setup could not finish.`n`n$($_.Exception.Message)"
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
    # 64 tells launch.vbs the operator has already been shown the reason, so it
    # does not follow this dialog with a second one carrying an exit code.
    exit 64
}
