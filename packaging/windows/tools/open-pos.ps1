# Opens the POS as a dedicated window on the counter screen.
#
# Launched with no console attached (see launch.vbs), so anything this script
# fails to say in a dialog, it does not say at all. Clicking the icon and
# getting a black flash and nothing else is the failure this guards against:
# every exit path below either opens the POS or explains why it could not.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$health = 'http://127.0.0.1:8080/actuator/health'
$appUrl = 'http://127.0.0.1:8080/'
$dataRoot = Join-Path $env:ProgramData 'GiftedLabs\Radiance POS'
$logPath = Join-Path $dataRoot 'logs\open-pos.log'

function Write-Log([string]$Message) {
    try {
        New-Item -ItemType Directory -Force (Split-Path $logPath -Parent) | Out-Null
        Add-Content -Path $logPath -Value ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message)
    } catch { }
}

function Show-Problem([string]$Message) {
    Write-Log "FAILED: $Message"
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "$Message`n`nOpen 'Radiance POS Diagnostics' from the Start menu for details.",
        'Radiance POS', 'OK', 'Error') | Out-Null
}

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
        Write-Log 'No Edge or Chrome found; using the default browser.'
        Start-Process $appUrl
        return
    }

    $appProfile = Join-Path $env:LOCALAPPDATA 'GiftedLabs\Radiance POS\AppWindow'
    New-Item -ItemType Directory -Force $appProfile | Out-Null
    Write-Log "Opening $appUrl through $browser"
    try {
        Start-Process -FilePath $browser -ArgumentList @(
            "--app=$appUrl",
            '--start-maximized',
            '--no-first-run',
            '--disable-session-crashed-bubble',
            "--user-data-dir=`"$appProfile`""
        )
    } catch {
        # A browser that refuses app mode must not cost the counter its till.
        Write-Log "App mode failed ($($_.Exception.Message)); falling back to the default browser."
        Start-Process $appUrl
    }
}

function Test-Healthy {
    try {
        return (Invoke-RestMethod -Uri $health -TimeoutSec 3).status -eq 'UP'
    } catch { return $false }
}

try {
    Write-Log 'Open Radiance POS requested.'

    if (Test-Healthy) { Open-AppWindow; exit 0 }

    # Not up yet. The service is delayed-start, so on a cold boot this is the
    # ordinary case rather than a fault — but a stopped service never starts by
    # being waited on, so try it before settling in to wait.
    $service = Get-Service RadiancePos -ErrorAction SilentlyContinue
    if (-not $service) {
        Show-Problem 'Radiance POS is not installed on this computer yet. Run "Configure or repair Radiance POS" from the Start menu.'
        exit 2
    }
    if ($service.Status -ne 'Running') {
        Write-Log "Service is $($service.Status); starting it."
        try { Start-Service RadiancePos } catch {
            Show-Problem "The Radiance POS service could not be started.`n`n$($_.Exception.Message)`n`nYou may need to run this from an administrator account."
            exit 3
        }
    }

    # Three minutes. A first start after an upgrade applies migrations before it
    # reports healthy, and the ninety seconds this used to allow expired in the
    # middle of that and told the operator the till was broken.
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        if (Test-Healthy) {
            Write-Log "Healthy after $attempt attempts."
            Open-AppWindow
            exit 0
        }
        Start-Sleep -Seconds 2
    }

    Show-Problem 'Radiance POS did not become ready within three minutes.'
    exit 1
} catch {
    Show-Problem "Radiance POS could not be opened.`n`n$($_.Exception.Message)"
    exit 1
}
