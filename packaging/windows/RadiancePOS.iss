#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#ifndef StageDir
  #define StageDir "stage"
#endif

[Setup]
AppId={{42A61CD0-F7D4-4C9F-A59C-688C2CE694A8}
AppName=Radiance POS
AppVersion={#MyAppVersion}
AppPublisher=GiftedLabs
DefaultDirName={autopf}\GiftedLabs\Radiance POS
DefaultGroupName=Radiance POS
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
OutputDir=..\..\dist
OutputBaseFilename=Radiance-POS-Setup-{#MyAppVersion}-x64
SetupLogging=yes
UninstallDisplayName=Radiance POS
CloseApplications=force
RestartApplications=no
ChangesEnvironment=no

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{commonappdata}\GiftedLabs\Radiance POS"; Permissions: admins-full system-full

[Icons]
; Through wscript + launch.vbs rather than powershell.exe directly. PowerShell
; applies -WindowStyle after it already owns a console, so every shortcut
; flashed a black window on the counter screen before anything else happened.
Name: "{group}\Open Radiance POS"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\tools\launch.vbs"" open-pos.ps1"; WorkingDir: "{app}"
Name: "{group}\Configure or repair Radiance POS"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\tools\launch.vbs"" onboard.ps1"; WorkingDir: "{app}"
Name: "{group}\Radiance POS Diagnostics"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\tools\launch.vbs"" diagnostics.ps1"; WorkingDir: "{app}"
Name: "{group}\Restore a Radiance POS backup"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\tools\launch.vbs"" restore-backup.ps1"; WorkingDir: "{app}"
Name: "{commondesktop}\Radiance POS"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\tools\launch.vbs"" open-pos.ps1"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\tools\launch.vbs"" onboard.ps1"; Description: "Configure this counter and start Radiance POS"; Flags: postinstall waituntilterminated; Check: NeedsOnboarding and not WizardSilent
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\tools\onboard.ps1"" -ConfigFile ""{code:GetOnboardingConfig}"" -NoLaunch"; Flags: runhidden waituntilterminated; Check: NeedsOnboarding and WizardSilent
Filename: "{app}\service\RadiancePosService.exe"; Parameters: "start"; Flags: runhidden waituntilterminated; Check: not NeedsOnboarding
; An upgrade over a configured counter has nothing to onboard, so nothing would
; otherwise open the POS. Without this the installer finished on a machine that
; showed the operator nothing at all.
Filename: "{sys}\wscript.exe"; Parameters: """{app}\tools\launch.vbs"" open-pos.ps1"; Description: "Open Radiance POS"; Flags: postinstall nowait; Check: not NeedsOnboarding and not WizardSilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\tools\uninstall-services.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "StopRadianceServices"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := IsAdminInstallMode;
  if not Result then
    MsgBox('Radiance POS must be installed by a Windows administrator.', mbError, MB_OK);
end;

function NeedsOnboarding(): Boolean;
begin
  Result := (not FileExists(ExpandConstant('{commonappdata}\GiftedLabs\Radiance POS\install-state.json'))) or
            (not RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\RadiancePos'));
end;

function GetOnboardingConfig(Param: String): String;
begin
  Result := ExpandConstant('{param:ONBOARDING|}');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  if WizardSilent and NeedsOnboarding and (GetOnboardingConfig('') = '') then begin
    Result := 'A fresh silent install requires /ONBOARDING=C:\path\onboarding.json.';
    exit;
  end;
  if RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\RadiancePos') then
    Exec('net.exe', 'stop RadiancePos /y', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\RadiancePosPostgreSQL') then
    Exec('net.exe', 'stop RadiancePosPostgreSQL /y', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    MsgBox('Radiance POS was removed. The sales database and backups remain in ProgramData\GiftedLabs\Radiance POS. Delete that folder only after you have verified a restorable backup.', mbInformation, MB_OK);
end;
