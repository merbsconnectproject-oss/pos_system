$ErrorActionPreference = 'Stop'
$health = 'http://127.0.0.1:8080/actuator/health'
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-RestMethod -Uri $health -TimeoutSec 2
        if ($response.status -eq 'UP') {
            Start-Process 'http://127.0.0.1:8080/'
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
