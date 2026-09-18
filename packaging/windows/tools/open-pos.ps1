$ErrorActionPreference = 'Stop'
$health = 'http://127.0.0.1:8080/actuator/health'
$appUrl = 'http://127.0.0.1:8080/'

function Find-AppBrowser {
    $registryCandidates = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe',
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe'
    )
    foreach ($key in $registryCandidates) {
        if (Test-Path $key) {
            $candidate = (Get-Item -LiteralPath $key).GetValue('')
            if ($candidate -and (Test-Path $candidate)) { return $candidate }
        }
    }

    $fileCandidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
    )
    foreach ($candidate in $fileCandidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    return $null
}

function Open-AppWindow {
    $browser = Find-AppBrowser
    if (-not $browser) {
        # Older stripped-down Windows images may have neither Edge nor Chrome.
        # The POS remains reachable, but only those machines fall back to the
        # default browser with its ordinary toolbar.
        Start-Process $appUrl
        return
    }

    $profile = Join-Path $env:LOCALAPPDATA 'GiftedLabs\Radiance POS\AppWindow'
    New-Item -ItemType Directory -Force $profile | Out-Null
    $arguments = @(
        "--app=$appUrl",
        '--start-maximized',
        '--no-first-run',
        '--disable-session-crashed-bubble',
        "--user-data-dir=`"$profile`""
    )
    Start-Process -FilePath $browser -ArgumentList $arguments
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-RestMethod -Uri $health -TimeoutSec 2
        if ($response.status -eq 'UP') {
            Open-AppWindow
            exit 0
        }
    } catch { }
    Start-Sleep -Seconds 1
}
Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
    'Radiance POS did not become ready. Open Radiance POS Diagnostics from the Start menu.',
    'Radiance POS', 'OK', 'Error') | Out-Null
exit 1
