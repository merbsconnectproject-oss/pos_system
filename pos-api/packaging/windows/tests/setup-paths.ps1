# Run with Windows PowerShell 5.1, as administrator. No database/service is changed.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$PgBin)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot '..\tools\setup-temp.ps1')

function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$originalTemp = $env:TEMP
$originalTmp = $env:TMP
$root = Join-Path $env:ProgramData ('Radiance setup path tests {0}' -f [guid]::NewGuid())
try {
    # A missing 8.3 alias reproduces machines with stale TEMP/TMP values.
    # Brackets also catch accidental wildcard interpretation of a real path.
    $profiles = @(
        (Join-Path $root 'Users\Shop Admin [CI]\AppData\Local\Temp'),
        (Join-Path $root 'Users\SHOPAD~1\AppData\Local\Temp')
    )
    New-Item -ItemType Directory -Path $profiles[0] -Force | Out-Null
    $fso = New-Object -ComObject Scripting.FileSystemObject
    $shortPath = $fso.GetFolder($profiles[0]).ShortPath
    if ($shortPath -match '~\d') { $profiles += $shortPath }

    foreach ($profileTemp in $profiles) {
        Write-Host "Checking inherited profile TEMP: $profileTemp"
        $profileTmp = $profileTemp + '-tmp'
        $env:TEMP = $profileTemp
        $env:TMP = $profileTmp
        $state = Start-RadianceSetupTemp -DataRoot $root
        $workspace = $state.Path
        try {
            Assert ($env:TEMP -eq $workspace -and $env:TMP -eq $workspace) 'Both temp variables must use the setup workspace.'
            Assert ([IO.Path]::GetTempPath().TrimEnd('\') -eq $workspace) '.NET must see the setup workspace too.'
            Assert (-not $workspace.Contains('\Users\')) 'Setup must not depend on the administrator profile.'
            $acl = Get-Acl -LiteralPath $workspace
            Assert $acl.AreAccessRulesProtected 'The password-file directory must not inherit public permissions.'
            $sids = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) |
                ForEach-Object { $_.IdentityReference.Value })
            $expectedSids = @('S-1-5-18', 'S-1-5-32-544', [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) | Select-Object -Unique
            Assert (@(Compare-Object $expectedSids $sids).Count -eq 0) 'Only SYSTEM, Administrators and the installing user may access setup temporary files.'

            # Onboarding compiles its Windows service-right helper with Add-Type.
            # A new type per case forces the compiler to use the current TEMP.
            $probe = 'RadianceSetupProbe' + [guid]::NewGuid().ToString('N')
            Add-Type -TypeDefinition "public static class $probe { public static bool Ready = true; }"

            # Exercise real native argument passing with spaces in both paths.
            $password = Join-Path $workspace 'postgres password.txt'
            [IO.File]::WriteAllText($password, 'Temporary-Test-Password-4827')
            $cluster = Join-Path $workspace 'test cluster'
            & (Join-Path $PgBin 'initdb.exe') -D $cluster -U postgres --pwfile $password --auth=scram-sha-256 --encoding=UTF8 --locale=C
            Assert ($LASTEXITCODE -eq 0) "initdb failed with inherited TEMP=$profileTemp"
            Assert (Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION')) 'initdb must create a complete cluster.'
        } finally { Stop-RadianceSetupTemp $state }
        Assert ($env:TEMP -eq $profileTemp -and $env:TMP -eq $profileTmp) 'Original process temp settings must be restored independently.'
        Assert (-not (Test-Path -LiteralPath $workspace)) 'Setup must remove temporary passwords and files.'
    }

    $state = Start-RadianceSetupTemp -DataRoot $root
    try {
        try { throw 'Simulated setup failure' } finally { Stop-RadianceSetupTemp $state }
    } catch {
        Assert ($_.Exception.Message -eq 'Simulated setup failure') 'Cleanup must preserve the setup error.'
    }
    Assert (-not (Test-Path -LiteralPath $state.Path)) 'A failed setup must also clean its workspace.'
    Assert ($env:TEMP -eq $profileTemp -and $env:TMP -eq $profileTmp) 'Failed setup must restore temp settings.'
    Write-Host 'NFR-13: setup paths, native initdb, private ACLs and cleanup passed.'
} finally {
    $env:TEMP = $originalTemp
    $env:TMP = $originalTmp
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
