# Windows PowerShell 5.1 helper. TEMP/TMP can contain an unavailable 8.3 alias
# (SHOPAD~1) or a profile name native installers cannot read. Use a private,
# per-run directory under ProgramData, including for Add-Type's compiler and
# child processes. Never change the user's persistent environment settings.
function Start-RadianceSetupTemp([string]$DataRoot) {
    $state = [pscustomobject]@{
        Path = Join-Path $DataRoot ('setup-temp-{0}' -f [guid]::NewGuid())
        Temp = [Environment]::GetEnvironmentVariable('TEMP', 'Process')
        Tmp = [Environment]::GetEnvironmentVariable('TMP', 'Process')
    }
    try {
        # Apply the ACL at creation, before a password or policy file exists.
        # SID constants work on Windows installations in any language.
        $acl = [Security.AccessControl.DirectorySecurity]::new()
        $acl.SetAccessRuleProtection($true, $false)
        # initdb drops the Administrators group from its child token. Keep the
        # installing user's SID explicitly so that child can still read pwfile.
        $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        foreach ($sid in (@('S-1-5-18', 'S-1-5-32-544', $currentSid) | Select-Object -Unique)) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new(
                [Security.Principal.SecurityIdentifier]::new($sid),
                [Security.AccessControl.FileSystemRights]::FullControl,
                [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
                [Security.AccessControl.PropagationFlags]::None,
                [Security.AccessControl.AccessControlType]::Allow)
            $acl.AddAccessRule($rule)
        }
        [IO.Directory]::CreateDirectory($state.Path, $acl) | Out-Null
        [Environment]::SetEnvironmentVariable('TEMP', $state.Path, 'Process')
        [Environment]::SetEnvironmentVariable('TMP', $state.Path, 'Process')
        return $state
    } catch {
        Stop-RadianceSetupTemp $state
        throw
    }
}

function Stop-RadianceSetupTemp($State) {
    if ($null -eq $State) { return }
    [Environment]::SetEnvironmentVariable('TEMP', $State.Temp, 'Process')
    [Environment]::SetEnvironmentVariable('TMP', $State.Tmp, 'Process')
    # Cleanup must not replace the original setup error. Individual secret
    # files are removed by their callers too; this also catches compiler and
    # native-tool leftovers on failed or cancelled runs.
    Remove-Item -LiteralPath $State.Path -Recurse -Force -ErrorAction SilentlyContinue
}
