[CmdletBinding()]
param(
    [string]$Version = '0.1.0',
    [string]$FrontendRoot = (Join-Path $PSScriptRoot '..\..\..\pos-system'),
    [string]$PostgresArchive,
    [string]$PostgresUrl = 'https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64-binaries.zip',
    [string]$PostgresSha256,
    [string]$WinSwPath,
    [string]$WinSwUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe',
    [string]$WinSwSha256,
    [string]$InnoCompiler = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$BackendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Stage = Join-Path $PSScriptRoot 'stage'
$DependencyCache = Join-Path $BackendRoot 'target\windows-dependencies'
$WebOutput = Join-Path $FrontendRoot 'dist-windows'

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$WorkingDirectory = $BackendRoot) {
    Push-Location $WorkingDirectory
    try {
        & $File @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
    } finally { Pop-Location }
}

function Assert-DependencyHash([string]$Path, [string]$Expected, [string]$Name) {
    $actual = (Get-FileHash $Path -Algorithm SHA256).Hash
    if ($Expected -and $actual -ne $Expected.ToUpperInvariant()) { throw "$Name SHA-256 mismatch. Expected $Expected, got $actual." }
    if (-not $Expected) { Write-Warning "$Name is not hash-pinned for this local build. SHA-256: $actual" }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'The Windows installer must be built on Windows.' }
if (-not (Test-Path (Join-Path $FrontendRoot 'package-lock.json'))) { throw "Frontend checkout not found at $FrontendRoot" }
if (-not (Test-Path $InnoCompiler)) { throw "Inno Setup compiler not found at $InnoCompiler" }

New-Item -ItemType Directory -Force $DependencyCache | Out-Null
Remove-Item $Stage, $WebOutput -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Stage, $WebOutput | Out-Null

Invoke-Checked 'npm.cmd' @('ci') $FrontendRoot
if (-not $SkipTests) { Invoke-Checked 'npm.cmd' @('run', 'check') $FrontendRoot }
Invoke-Checked 'npx.cmd' @('vite', 'build', '--outDir', $WebOutput, '--emptyOutDir') $FrontendRoot

$mavenArgs = @('-B', 'clean', 'package', '-Pbundled-frontend', "-Dfrontend.dist=$WebOutput")
if ($SkipTests) { $mavenArgs += '-DskipTests' }
Invoke-Checked (Join-Path $BackendRoot 'mvnw.cmd') $mavenArgs

$jar = Get-ChildItem (Join-Path $BackendRoot 'target') -Filter 'pos-api-*.jar' |
    Where-Object Name -NotLike '*.original' | Select-Object -First 1
if (-not $jar) { throw 'Backend executable JAR was not produced.' }
$jarListing = & jar.exe tf $jar.FullName
if ($jarListing -notcontains 'BOOT-INF/classes/static/index.html') { throw 'The executable JAR does not contain the frontend index.' }

New-Item -ItemType Directory -Force (Join-Path $Stage 'app'), (Join-Path $Stage 'service'), (Join-Path $Stage 'tools') | Out-Null
Copy-Item $jar.FullName (Join-Path $Stage 'app\pos-api.jar')
Copy-Item (Join-Path $PSScriptRoot 'service\RadiancePosService.xml') (Join-Path $Stage 'service\RadiancePosService.xml')
Copy-Item (Join-Path $PSScriptRoot 'tools\*') (Join-Path $Stage 'tools')
Copy-Item (Join-Path $BackendRoot 'LICENSE') $Stage
Copy-Item (Join-Path $PSScriptRoot 'THIRD-PARTY-NOTICES.txt') $Stage

# A private runtime keeps the counter independent of whichever Java happens to
# be installed on Windows. ALL-MODULE-PATH is intentionally conservative for a
# reflective Spring application; reliability matters more than saving 30 MB.
$jmods = Join-Path $env:JAVA_HOME 'jmods'
if (-not (Test-Path $jmods)) { throw "JDK modules not found at $jmods" }
Invoke-Checked 'jlink.exe' @('--module-path', $jmods, '--add-modules', 'ALL-MODULE-PATH', '--strip-debug', '--no-header-files', '--no-man-pages', '--compress=zip-6', '--output', (Join-Path $Stage 'runtime'))

if (-not $WinSwPath) {
    $WinSwPath = Join-Path $DependencyCache 'WinSW-x64-2.12.0.exe'
    if (-not (Test-Path $WinSwPath)) { Invoke-WebRequest $WinSwUrl -OutFile $WinSwPath }
}
Assert-DependencyHash $WinSwPath $WinSwSha256 'WinSW'
Copy-Item $WinSwPath (Join-Path $Stage 'service\RadiancePosService.exe')

if (-not $PostgresArchive) {
    $PostgresArchive = Join-Path $DependencyCache 'postgresql-18.6-1-windows-x64-binaries.zip'
    if (-not (Test-Path $PostgresArchive)) { Invoke-WebRequest $PostgresUrl -OutFile $PostgresArchive }
}
Assert-DependencyHash $PostgresArchive $PostgresSha256 'PostgreSQL binaries'
$pgExtract = Join-Path $DependencyCache 'postgresql-extracted'
Remove-Item $pgExtract -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive $PostgresArchive $pgExtract
$initdb = Get-ChildItem $pgExtract -Filter initdb.exe -Recurse | Select-Object -First 1
if (-not $initdb) { throw 'PostgreSQL archive does not contain initdb.exe.' }
$pgRoot = Split-Path (Split-Path $initdb.FullName -Parent) -Parent
Copy-Item $pgRoot (Join-Path $Stage 'postgresql') -Recurse

Invoke-Checked $InnoCompiler @("/DMyAppVersion=$Version", "/DStageDir=$Stage", (Join-Path $PSScriptRoot 'RadiancePOS.iss'))
$installer = Join-Path $BackendRoot "dist\Radiance-POS-Setup-$Version-x64.exe"
if (-not (Test-Path $installer)) { throw 'Inno Setup did not produce the expected installer.' }
$hash = (Get-FileHash $installer -Algorithm SHA256).Hash
Set-Content "$installer.sha256" "$hash  $([IO.Path]::GetFileName($installer))" -Encoding ascii
Write-Host "Built $installer"
Write-Host "SHA256 $hash"
