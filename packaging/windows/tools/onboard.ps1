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
# PostgreSQL requires the account that owns the cluster to be the account that
# runs the server. An installing administrator necessarily runs initdb, and no
# built-in service account can ever be that administrator — which is why
# granting LocalSystem or NetworkService access to the data directory kept
# failing where ownership was what was being asked for. A dedicated local
# account owns the cluster and runs the service, which is what PostgreSQL's own
# Windows installer has always done.
$DbAccount = 'RadiancePosDb'
$DbAccountSecretPath = Join-Path $SecretsRoot 'db-service-account.secret'
$script:DbAccountSid = $null
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

function Write-Step([string]$Message) {
    # Setup runs hidden, so the transcript is the only account of where it got
    # to. One install hung and burned six hours of CI proving only that it had
    # hung somewhere; a line per step is what makes the next one cost minutes.
    Write-Host ('{0:HH:mm:ss}  {1}' -f (Get-Date), $Message)
}

function Invoke-Checked([string]$File, [string[]]$Arguments, [hashtable]$Environment = @{}) {
    foreach ($entry in $Environment.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process') }
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE." }
}

function Invoke-IcaclsChecked([string]$Context, [string[]]$Arguments) {
    Write-Step "Applying permissions to $Context"
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

function Set-FolderAccess([string]$Context, [string]$Path, [string[]]$Grants) {
    # Inheritance flags describe what a container hands to its children. On a
    # leaf they describe nothing, so applying them to files with /T wrote ACEs
    # that granted those files nothing at all — which is how the service account
    # came to be refused application.properties while holding full control of
    # the folder containing it. Set the folder once, then let its contents take
    # those entries by inheritance.
    Invoke-IcaclsChecked $Context (@($Path, '/inheritance:r', '/grant:r') + $Grants + @('/C'))
    if (Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue) {
        # The wildcard matters: /reset on $Path itself would replace what was
        # just granted with whatever it inherits.
        Invoke-IcaclsChecked "$Context contents" @((Join-Path $Path '*'), '/reset', '/T', '/C')
    }
}

function Set-DataPermissions {
    $dbSid = Get-DbAccountSid
    $system = '*S-1-5-18:(OI)(CI)F'
    $admins = '*S-1-5-32-544:(OI)(CI)F'

    # The data root keeps non-inheritable traverse entries for the two service
    # accounts, and its children are deliberately not reset: each one below sets
    # its own, and the cluster's was set before PostgreSQL first started.
    Invoke-IcaclsChecked 'the Radiance POS data directory' @($DataRoot, '/inheritance:r', '/grant:r', $system, $admins, '*S-1-5-19:RX', "*$($dbSid):RX", '/C')

    Set-FolderAccess 'the application configuration' $ConfigRoot @($system, $admins, '*S-1-5-19:(OI)(CI)RX')
    Set-FolderAccess 'the backup directory' (Join-Path $DataRoot 'backups') @($system, $admins, '*S-1-5-19:(OI)(CI)M', "*$($dbSid):(OI)(CI)M")
    Set-FolderAccess 'the log directory' (Join-Path $DataRoot 'logs') @($system, $admins, '*S-1-5-19:(OI)(CI)M', "*$($dbSid):(OI)(CI)M")
    Set-FolderAccess 'the protected secrets directory' $SecretsRoot @($system, $admins)

    # The cluster is deliberately not in the list above. Initialize-Database
    # gives it these same entries before PostgreSQL first opens it, and by the
    # time this runs the server is live and holding its files. Re-applying them
    # here only reset the ACL of every open file in a running database, and
    # Invoke-IcaclsChecked treats a single file it cannot touch as a failed
    # install. The folder's own entry is refreshed; its contents are left alone.
    Invoke-IcaclsChecked 'the PostgreSQL cluster' @($PgData, '/inheritance:r', '/grant:r', $system, $admins, "*$($dbSid):(OI)(CI)F", '/C')
}

function Test-ServiceLogonRight([string]$Sid) {
    # Read-only: exports the policy and looks, and never writes one back. The
    # grant below is only believed once this says so.
    $export = Join-Path $env:TEMP ("radiance-secpol-read-{0}.inf" -f [guid]::NewGuid())
    try {
        & secedit.exe /export /cfg $export /areas USER_RIGHTS 2>&1 | Out-Null
        if (-not (Test-Path $export)) { return $false }
        foreach ($line in Get-Content $export) {
            if ($line -like 'SeServiceLogonRight*') { return ($line -like "*$Sid*") }
        }
        return $false
    } catch { return $false } finally {
        Remove-Item $export -Force -ErrorAction SilentlyContinue
    }
}

function Add-ServiceLogonRightViaLsa([string]$Sid) {
    # LsaAddAccountRights adds one right to one account. secedit /configure
    # rewrites every user right on the machine from a file, which is a large
    # thing to do to a shop's PC in order to change one entry, and which a
    # managed machine may refuse or revert wholesale.
    if (-not ('Radiance.Lsa' -as [type])) {
        Add-Type -Namespace 'Radiance' -Name 'Lsa' -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)]
struct LSA_UNICODE_STRING { public ushort Length; public ushort MaximumLength; public IntPtr Buffer; }

[StructLayout(LayoutKind.Sequential)]
struct LSA_OBJECT_ATTRIBUTES {
    public int Length; public IntPtr RootDirectory; public IntPtr ObjectName;
    public int Attributes; public IntPtr SecurityDescriptor; public IntPtr SecurityQualityOfService;
}

[DllImport("advapi32.dll", SetLastError = true)]
static extern uint LsaOpenPolicy(IntPtr SystemName, ref LSA_OBJECT_ATTRIBUTES ObjectAttributes, int DesiredAccess, out IntPtr PolicyHandle);

[DllImport("advapi32.dll", SetLastError = true)]
static extern uint LsaAddAccountRights(IntPtr PolicyHandle, byte[] AccountSid, LSA_UNICODE_STRING[] UserRights, int CountOfRights);

[DllImport("advapi32.dll")]
static extern uint LsaClose(IntPtr PolicyHandle);

[DllImport("advapi32.dll")]
static extern int LsaNtStatusToWinError(uint Status);

public static void AddRight(string sid, string right) {
    var identifier = new System.Security.Principal.SecurityIdentifier(sid);
    byte[] rawSid = new byte[identifier.BinaryLength];
    identifier.GetBinaryForm(rawSid, 0);

    var attributes = new LSA_OBJECT_ATTRIBUTES();
    attributes.Length = Marshal.SizeOf(typeof(LSA_OBJECT_ATTRIBUTES));

    IntPtr policy;
    // POLICY_CREATE_ACCOUNT | POLICY_LOOKUP_NAMES
    uint status = LsaOpenPolicy(IntPtr.Zero, ref attributes, 0x00000010 | 0x00000800, out policy);
    if (status != 0) throw new System.ComponentModel.Win32Exception(LsaNtStatusToWinError(status));
    try {
        var rights = new LSA_UNICODE_STRING[1];
        rights[0].Buffer = Marshal.StringToHGlobalUni(right);
        rights[0].Length = (ushort)(right.Length * 2);
        rights[0].MaximumLength = (ushort)((right.Length + 1) * 2);
        try {
            status = LsaAddAccountRights(policy, rawSid, rights, 1);
            if (status != 0) throw new System.ComponentModel.Win32Exception(LsaNtStatusToWinError(status));
        } finally { Marshal.FreeHGlobal(rights[0].Buffer); }
    } finally { LsaClose(policy); }
}
'@
    }
    [Radiance.Lsa]::AddRight($Sid, 'SeServiceLogonRight')
}

function Add-ServiceLogonRightViaSecedit([string]$Sid) {
    $export = Join-Path $env:TEMP ("radiance-secpol-{0}.inf" -f [guid]::NewGuid())
    $database = Join-Path $env:TEMP ("radiance-secpol-{0}.sdb" -f [guid]::NewGuid())
    try {
        & secedit.exe /export /cfg $export /areas USER_RIGHTS 2>&1 | Out-Null
        if (-not (Test-Path $export)) { throw 'secedit could not export the local security policy.' }
        $lines = [Collections.Generic.List[string]](Get-Content $export)
        $index = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -like 'SeServiceLogonRight*') { $index = $i; break }
        }
        if ($index -ge 0) {
            $lines[$index] = "$($lines[$index]),*$Sid"
        } else {
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($lines[$i].Trim() -eq '[Privilege Rights]') { $index = $i; break }
            }
            if ($index -lt 0) { throw 'The local security policy has no [Privilege Rights] section.' }
            $lines.Insert($index + 1, "SeServiceLogonRight = *$Sid")
        }
        Set-Content -LiteralPath $export -Value $lines -Encoding Unicode
        & secedit.exe /configure /db $database /cfg $export /areas USER_RIGHTS 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "secedit refused the policy change (exit code $LASTEXITCODE)." }
    } finally {
        Remove-Item $export, $database -Force -ErrorAction SilentlyContinue
    }
}

function Grant-ServiceLogonRight([string]$Sid) {
    # CreateService does not grant SeServiceLogonRight, so a service registered
    # to an account that lacks it fails to start with error 1069 and nothing in
    # any log the installer writes. That is the single most likely reason a
    # counter reports "the PostgreSQL service would not start", so this no
    # longer assumes the grant worked: it grants, then reads the policy back,
    # and says so plainly when the machine would not take it.
    Write-Step 'Reading the local security policy'
    if (Test-ServiceLogonRight $Sid) { return }

    Write-Step 'Granting the right to run as a service'
    $failures = [Collections.Generic.List[string]]::new()
    try { Add-ServiceLogonRightViaLsa $Sid } catch { $failures.Add("LSA: $($_.Exception.Message)") }
    if (-not (Test-ServiceLogonRight $Sid)) {
        try { Add-ServiceLogonRightViaSecedit $Sid } catch { $failures.Add("secedit: $($_.Exception.Message)") }
    }
    if (Test-ServiceLogonRight $Sid) { return }

    throw ("Windows would not grant $DbAccount the right to log on as a service, so its " +
           "database service cannot start.`n`n" +
           $(if ($failures.Count) { ($failures -join "`n") } else { 'The policy reported no error but the right is still absent.' }) +
           "`n`nA group policy that manages 'Log on as a service', or security software blocking " +
           'changes to the local security policy, is the usual cause. Add ' +
           "$env:COMPUTERNAME\$DbAccount to 'Log on as a service' in Local Security Policy " +
           "(secpol.msc, Local Policies > User Rights Assignment), then run " +
           "'Configure or repair Radiance POS' again.")
}

function Initialize-DatabaseAccount {
    # Returns the account's password. Reused when it already exists, because the
    # cluster's files are owned by this account and a counter that loses it
    # cannot start its own database.
    $password = Read-Secret $DbAccountSecretPath 'database service account password'
    if (-not $password) {
        # The suffix guarantees the mix a local complexity policy may demand;
        # New-RandomSecret is deliberately alphanumeric so it survives quoting.
        $password = (New-RandomSecret 24) + '!Aa9'
    }
    $secure = ConvertTo-SecureString $password -AsPlainText -Force

    if (Get-LocalUser -Name $DbAccount -ErrorAction SilentlyContinue) {
        Set-LocalUser -Name $DbAccount -Password $secure -PasswordNeverExpires $true
    } else {
        New-LocalUser -Name $DbAccount -Password $secure -FullName 'Radiance POS database' `
            -Description 'Owns and runs the Radiance POS database' `
            -PasswordNeverExpires -UserMayNotChangePassword -AccountNeverExpires | Out-Null
    }
    Save-Secret $DbAccountSecretPath $password

    # New-LocalUser puts the account in no group at all, so it holds nothing on
    # C:\ProgramData or the GiftedLabs folder above the cluster - and postgres
    # failed its first stat() of postgresql.conf with a plain permission denied.
    # Users is the baseline every Windows service account runs with; the SID is
    # used because the group's name is localised.
    Write-Step 'Adding the database account to Users'
    try {
        Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $DbAccount -ErrorAction Stop
    } catch {
        # Already a member is the ordinary case on every run after the first.
        if ($_.FullyQualifiedErrorId -notmatch 'MemberExists') { throw }
    }

    $script:DbAccountSid = (Get-LocalUser -Name $DbAccount).SID.Value
    Grant-ServiceLogonRight $script:DbAccountSid
    # The cluster binaries live under Program Files, and New-LocalUser puts this
    # account in no group, so it is granted nothing there by default. No /T: an
    # inheritable ACE at the root reaches every file the installer wrote, while
    # walking a few thousand of them invites one locked file to fail the whole
    # grant - and Invoke-IcaclsChecked treats a partial failure as fatal.
    Invoke-IcaclsChecked 'the Radiance POS program files' @($InstallRoot, '/grant:r', "*$($script:DbAccountSid):(OI)(CI)RX", '/C')
    return $password
}

function Get-DbAccountSid {
    if ($script:DbAccountSid) { return $script:DbAccountSid }
    $user = Get-LocalUser -Name $DbAccount -ErrorAction SilentlyContinue
    if (-not $user) {
        throw "The $DbAccount Windows account is missing. Run 'Reset this counter before setup' from the Start menu, then set up again."
    }
    $script:DbAccountSid = $user.SID.Value
    return $script:DbAccountSid
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
    # Inheritance flags on the folder, a plain grant on what is already in it —
    # the same distinction that had files carrying ACEs which granted nothing.
    try { & icacls.exe $folder '/grant' '*S-1-5-32-544:(OI)(CI)F' '/C' 2>&1 | Out-Null } catch { }
    try { & icacls.exe (Join-Path $folder '*') '/grant' '*S-1-5-32-544:F' '/T' '/C' 2>&1 | Out-Null } catch { }
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

function Wait-PostgresAcceptingConnections([int]$Seconds = 60) {
    $isReady = Join-Path $PgBin 'pg_isready.exe'
    $deadline = (Get-Date).AddSeconds($Seconds)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        do {
            & $isReady '-h' '127.0.0.1' '-p' "$PgPort" '-q' 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { return }
            Start-Sleep 1
        } while ((Get-Date) -lt $deadline)
    } finally { $ErrorActionPreference = $previous }
    $tail = if (Test-Path $PgLog) { (Get-Content -Tail 15 $PgLog) -join "`n" } else { "Nothing was written to $PgLog." }
    throw ("The PostgreSQL service is running but is not accepting connections on port $PgPort " +
           "after $Seconds seconds.`n`n$tail")
}

function Get-ServiceStartFailureHint([int]$Code) {
    # Start-Service says "failed to start" for every one of these. The number
    # underneath is the only thing that distinguishes a password Windows
    # rejected from a binary it could not load, and each has a different answer.
    switch ($Code) {
        1069 { return ("Windows error 1069: the service could not log on. The $DbAccount account's " +
                       "password or its right to log on as a service was refused. Run 'Configure or " +
                       "repair Radiance POS' from the Start menu, which rebuilds both.") }
        1053 { return ('Windows error 1053: the service started but did not report ready in time. ' +
                       'PostgreSQL usually writes the reason to its own log, below.') }
        1067 { return ('Windows error 1067: the service process exited immediately. PostgreSQL ' +
                       'usually writes the reason to its own log, below.') }
        1058 { return ('Windows error 1058: the service is disabled. Run "Reset this counter before ' +
                       'setup", then set up again.') }
        2    { return ('Windows error 2: the service executable is missing. Reinstall Radiance POS.') }
        5    { return ('Windows error 5: access denied starting the service. Setup must run as an ' +
                       'administrator.') }
        1275 { return ('Windows error 1275: security software blocked the service driver or binary.') }
        default { return $null }
    }
}

function Start-PostgresService {
    $reason = $null
    $code = 0
    # Twice, a few seconds apart. A registration created moments ago can lose a
    # first start to the service control manager still settling, and a single
    # attempt turned that into a failed install.
    foreach ($attempt in 1, 2) {
        try {
            Start-Service RadiancePosPostgreSQL
            return
        } catch {
            $reason = $_.Exception.Message
            $win32 = $_.Exception
            while ($win32 -and -not ($win32 -is [ComponentModel.Win32Exception])) { $win32 = $win32.InnerException }
            if ($win32) { $code = $win32.NativeErrorCode }
        }
        if ($attempt -eq 1) { Start-Sleep 5 }
    }
    $hint = Get-ServiceStartFailureHint $code
    if ($hint) { $reason = "$reason`n`n$hint" }

    # "Failed to start service" is everything Start-Service knows and nothing an
    # operator can act on. PostgreSQL writes the actual reason — a port already
    # taken, a data directory it cannot read, a lock file from a crash — to its
    # own log, so that is what goes in the message.
    $detail = @()
    if (Test-Path $PgLog) { $detail += (Get-Content -Tail 15 $PgLog) }
    # A cluster that dies before its logging collector opens a file writes
    # nothing here, and that is exactly the failure that has to be readable: the
    # Service Control Manager records a logon failure or a missing binary in the
    # event log and nowhere else.
    try {
        $events = Get-WinEvent -FilterHashtable @{
            LogName = 'Application', 'System'
            StartTime = (Get-Date).AddMinutes(-10)
        } -ErrorAction SilentlyContinue |
            Where-Object { $_.Message -match 'RadiancePosPostgreSQL|postgres' } |
            Select-Object -First 5
        foreach ($event in $events) { $detail += "[$($event.ProviderName)] $($event.Message)" }
    } catch { }
    # The permissions themselves, because every theory about them so far has
    # been wrong and the message is the only place they can be checked.
    foreach ($subject in $PgData, (Join-Path $PgData 'postgresql.conf'), $DataRoot) {
        if (Test-Path $subject) {
            $detail += "--- icacls $subject ---"
            $detail += (& icacls.exe $subject 2>&1 | ForEach-Object { "$_" })
        }
    }
    # Who the service was told to run as, and whether Windows will let that
    # account be a service at all. Those two facts are the whole of error 1069
    # and neither was previously recorded anywhere.
    try {
        $serviceInfo = Get-CimInstance Win32_Service -Filter "Name='RadiancePosPostgreSQL'" -ErrorAction SilentlyContinue
        if ($serviceInfo) {
            $detail += "Service account: $($serviceInfo.StartName)"
            $detail += "Service binary: $($serviceInfo.PathName)"
        }
        $sid = Get-DbAccountSid
        $detail += "$DbAccount SID: $sid"
        $detail += "$DbAccount holds 'log on as a service': $(Test-ServiceLogonRight $sid)"
    } catch { $detail += "Could not read the service account: $($_.Exception.Message)" }
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

function Test-PostgresBinaries {
    # A functional probe, not a hunt through imports: whatever the binaries need
    # in order to load, Windows answers that question here, on the exact
    # executable the service runs. -V is handled before postgres looks at a data
    # directory or at who is running it, so this asks nothing else.
    # Continue, not Stop: Windows PowerShell turns a native command's redirected
    # stderr into a terminating error while $ErrorActionPreference is Stop, and a
    # binary that cannot load says so on stderr - which is the answer this is
    # asking for, not a reason to abandon the run.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & (Join-Path $PgBin 'postgres.exe') '-V' 2>&1 | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false } finally { $ErrorActionPreference = $previous }
}

function Install-VisualCppRuntime {
    # PostgreSQL's Windows binaries are built with MSVC and need the Visual C++
    # runtime, which is not part of Windows and which the upstream binaries zip
    # does not carry - EDB's own installer ships the redistributable beside it.
    # A build machine and a CI runner have it already; a shop's counter PC often
    # does not, and every PostgreSQL executable then fails to load with nothing
    # written anywhere. The installer carries a copy so this stays offline.
    $redist = Join-Path $InstallRoot 'vendor\vc_redist.x64.exe'
    if (-not (Test-Path $redist)) {
        throw ('PostgreSQL cannot run on this computer: it needs the Microsoft Visual C++ ' +
               'runtime, which is not installed, and this build does not carry a copy. ' +
               'Install the Microsoft Visual C++ 2015-2022 Redistributable (x64) from ' +
               "Microsoft, then run 'Configure or repair Radiance POS' again.")
    }
    Write-Step 'Installing the Microsoft Visual C++ runtime PostgreSQL needs'
    $process = Start-Process $redist -ArgumentList '/install', '/quiet', '/norestart' -Wait -PassThru
    # 1638 is a newer runtime already present; 3010 is installed, reboot pending.
    # The files are on disk in both cases, which is all PostgreSQL needs.
    if ($process.ExitCode -notin 0, 1638, 3010) {
        throw ("The Microsoft Visual C++ runtime installer failed with exit code $($process.ExitCode). " +
               'PostgreSQL cannot start without it.')
    }
}

function Assert-PostgresRuntime {
    Write-Step 'Checking that the database binaries can run on this computer'
    if (Test-PostgresBinaries) { return }
    Install-VisualCppRuntime
    if (Test-PostgresBinaries) { return }
    throw ('The bundled PostgreSQL executables still will not run on this computer after the ' +
           'Microsoft Visual C++ runtime was installed. Security software blocking ' +
           "$PgBin is the usual remaining cause; allow that folder and run " +
           "'Configure or repair Radiance POS' again.")
}

function Initialize-Database([string]$SuperPassword, [string]$DatabasePassword) {
    foreach ($tool in 'initdb.exe', 'pg_ctl.exe', 'psql.exe', 'createdb.exe', 'pg_isready.exe', 'postgres.exe') {
        if (-not (Test-Path (Join-Path $PgBin $tool))) { throw "PostgreSQL tool is missing: $tool" }
    }
    # Before initdb, not after: a counter without the Visual C++ runtime fails
    # every PostgreSQL binary, and "the service would not start" is the last and
    # least informative place to discover that.
    Assert-PostgresRuntime
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
    Write-Step 'Creating the database service account'
    $dbPassword = Initialize-DatabaseAccount
    $dbSid = Get-DbAccountSid

    # Ownership, not access. PostgreSQL says it plainly during initdb: "the
    # files belonging to this database system will be owned by user X; this user
    # must also own the server process." initdb necessarily runs as the
    # installing administrator, so the cluster is handed to the service account
    # afterwards. takeown first, because an administrator cannot reassign what
    # it has no say over — one counter reported 305 of 1288 files refused.
    Write-Step 'Taking ownership of the cluster'
    & takeown.exe /F $PgData /R /A /D Y 2>&1 | Out-Null
    Invoke-IcaclsChecked 'the PostgreSQL cluster owner' @($PgData, '/setowner', "*$dbSid", '/T', '/C')
    # Set the folder's ACL, then let every child re-inherit it. Stamping
    # (OI)(CI) onto files with /T writes inheritance flags onto leaf objects,
    # which is not what those flags mean and not how the tree is meant to be
    # granted; /reset makes each child take the parent's entries cleanly.
    Invoke-IcaclsChecked 'the PostgreSQL cluster' @($PgData, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', "*$($dbSid):(OI)(CI)F", '/C')
    # The wildcard matters: /reset on $PgData itself would replace the ACL set
    # on the line above with whatever it inherits, undoing the grant.
    Invoke-IcaclsChecked 'the PostgreSQL cluster contents' @((Join-Path $PgData '*'), '/reset', '/T', '/C')
    # Traverse every folder between the cluster and the drive that setup owns.
    Invoke-IcaclsChecked 'the Radiance POS data directory' @($DataRoot, '/grant:r', "*$($dbSid):RX", '/C')
    Invoke-IcaclsChecked 'the GiftedLabs data folder' @((Split-Path $DataRoot -Parent), '/grant:r', "*$($dbSid):RX", '/C')
    Invoke-IcaclsChecked 'the PostgreSQL log directory' @((Join-Path $DataRoot 'logs'), '/grant:r', "*$($dbSid):(OI)(CI)M", '/C')

    # Setup used to keep a registration it recognised and only replace one whose
    # data directory or account looked wrong. That left the one failure it could
    # not see: a service still holding the password it was registered with, on an
    # account whose password setup has since changed. Windows reports that as
    # error 1069 and writes nothing anywhere, and the check for it was a guess
    # about whether the stored secret was new.
    #
    # Registering is cheap and the account's password is known for certain right
    # here, so the registration is simply rebuilt every run. The service and the
    # account can then never disagree about the password.
    $existing = Get-Service RadiancePosPostgreSQL -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Step 'Replacing the PostgreSQL service registration'
        Stop-Service RadiancePosPostgreSQL -Force -ErrorAction SilentlyContinue
        & (Join-Path $PgBin 'pg_ctl.exe') unregister -N RadiancePosPostgreSQL 2>&1 | Out-Null
        # A service with an open handle is marked for deletion rather than
        # removed, and registering over it fails with "marked for deletion" -
        # which reads like a permissions problem and is not one.
        $deadline = (Get-Date).AddSeconds(30)
        while ((Get-Service RadiancePosPostgreSQL -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
            Start-Sleep 1
        }
        if (Get-Service RadiancePosPostgreSQL -ErrorAction SilentlyContinue) {
            throw ('Windows would not remove the old RadiancePosPostgreSQL service registration. ' +
                   "Restart this computer and run 'Configure or repair Radiance POS' again.")
        }
    }
    # -l is ignored by pg_ctl's Windows register mode. PostgreSQL's logging
    # collector above writes the durable file, while -e gives very-early service
    # failures a distinct Windows event source.
    Write-Step 'Registering the PostgreSQL service'
    Invoke-Checked (Join-Path $PgBin 'pg_ctl.exe') @('register', '-N', 'RadiancePosPostgreSQL', '-D', $PgData, '-S', 'auto', '-U', ".\$DbAccount", '-P', $dbPassword, '-e', 'RadiancePosPostgreSQL')

    Write-Step 'Starting the PostgreSQL service'
    Start-PostgresService
    Wait-ServiceReady RadiancePosPostgreSQL
    # A running service means the postmaster launched, not that it is accepting
    # connections. psql used to be the first thing to find out, and reported it
    # as "could not connect to the private PostgreSQL instance" - which is also
    # what a wrong password looks like.
    Wait-PostgresAcceptingConnections
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
    # A response file means there is no operator at this desktop. Inno waits for
    # this process, so showing a modal dialog in that path leaves a silent install
    # hung forever even though the counter is already healthy and configured.
    if (-not $ConfigFile) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show('Radiance POS is installed, protected, and ready to use.', 'Setup complete', 'OK', 'Information') | Out-Null
    }
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
} catch {
    Show-SetupFailure "Setup could not finish.`n`n$($_.Exception.Message)"
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
    # 64 tells launch.vbs the operator has already been shown the reason, so it
    # does not follow this dialog with a second one carrying an exit code.
    exit 64
}
