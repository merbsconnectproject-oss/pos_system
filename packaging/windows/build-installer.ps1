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
    # PostgreSQL's Windows binaries are MSVC builds and need the Visual C++
    # runtime, which is not part of Windows and is not in the upstream binaries
    # zip. Build machines and CI runners have it; a shop's counter PC often does
    # not, and then every PostgreSQL executable fails to load. Carried in the
    # installer so a counter with no internet can still be set up.
    [string]$VcRedistPath,
    [string]$VcRedistUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
    [string]$VcRedistSha256,
    [string]$InnoCompiler = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    # How the installed counter opens the POS. AppWindow is what a till should
    # look like; Browser is the same application in the machine's ordinary
    # browser, built as a separate artifact so the two can be compared on real
    # hardware rather than argued about.
    [ValidateSet('AppWindow', 'Browser')][string]$LaunchMode = 'AppWindow',
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

Remove-Item $Stage, $WebOutput -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Stage, $WebOutput | Out-Null

Invoke-Checked 'npm.cmd' @('ci') $FrontendRoot
if (-not $SkipTests) { Invoke-Checked 'npm.cmd' @('run', 'check') $FrontendRoot }
Invoke-Checked 'npx.cmd' @('vite', 'build', '--outDir', $WebOutput, '--emptyOutDir') $FrontendRoot

$mavenArgs = @('-B', 'clean', 'package', '-Pbundled-frontend', "-Dfrontend.dist=$WebOutput")
if ($SkipTests) { $mavenArgs += '-DskipTests' }
Invoke-Checked (Join-Path $BackendRoot 'mvnw.cmd') $mavenArgs
New-Item -ItemType Directory -Force $DependencyCache | Out-Null

$jar = Get-ChildItem (Join-Path $BackendRoot 'target') -Filter 'pos-api-*.jar' |
    Where-Object Name -NotLike '*.original' | Select-Object -First 1
if (-not $jar) { throw 'Backend executable JAR was not produced.' }
$jarListing = & jar.exe tf $jar.FullName
if ($jarListing -notcontains 'BOOT-INF/classes/static/index.html') { throw 'The executable JAR does not contain the frontend index.' }

New-Item -ItemType Directory -Force (Join-Path $Stage 'app'), (Join-Path $Stage 'service'), (Join-Path $Stage 'tools') | Out-Null
Copy-Item $jar.FullName (Join-Path $Stage 'app\pos-api.jar')
Copy-Item (Join-Path $PSScriptRoot 'radiance-pos.ico') (Join-Path $Stage 'radiance-pos.ico')
Copy-Item (Join-Path $PSScriptRoot 'service\RadiancePosService.xml') (Join-Path $Stage 'service\RadiancePosService.xml')
Copy-Item (Join-Path $PSScriptRoot 'tools\*') (Join-Path $Stage 'tools')

# Every shortcut goes through the console-free shim, so a stage without it
# installs a Start menu whose entries do nothing. Checked here rather than
# discovered on a counter.
foreach ($tool in 'launch.vbs', 'open-pos.ps1', 'onboard.ps1', 'diagnostics.ps1', 'restore-backup.ps1', 'uninstall-services.ps1', 'reset-counter.ps1') {
    if (-not (Test-Path (Join-Path $Stage "tools\$tool"))) { throw "Staged tools are missing $tool." }
}

# A script that does not parse is a shortcut that flashes and vanishes. The
# diagnostics tool shipped broken this way once; the build now refuses instead.
Get-ChildItem (Join-Path $Stage 'tools') -Filter *.ps1 | ForEach-Object {
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$null, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count) {
        throw "$($_.Name) has $($parseErrors.Count) parse error(s): $($parseErrors[0].Message)"
    }
}
# Stamped so a counter can always answer "which build is this?". Diagnosing a
# broken install without knowing what is installed wastes a support call before
# it starts.
# Wrapped because $ErrorActionPreference is Stop: on a build machine without
# git, an unguarded call would abort the whole run here, after the frontend and
# the backend have already been built, over a line of text.
$commit = 'unknown'
try {
    $described = & git -C $BackendRoot rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $described) { $commit = $described }
} catch { }
Set-Content (Join-Path $Stage 'VERSION.txt') @(
    "Radiance POS $Version"
    "commit  $commit"
    "built   $((Get-Date).ToUniversalTime().ToString('u'))"
    "launch  $LaunchMode"
) -Encoding ascii

# Read by open-pos.ps1, which a counter may override in ProgramData without
# reinstalling. Kept as its own file rather than parsed back out of VERSION.txt:
# a stamp for people to read and a setting for a script to read are different
# things, and one of them is allowed to change.
Set-Content (Join-Path $Stage 'LAUNCH-MODE.txt') $LaunchMode -Encoding ascii

Copy-Item (Join-Path $BackendRoot 'LICENSE') $Stage
Copy-Item (Join-Path $PSScriptRoot 'THIRD-PARTY-NOTICES.txt') $Stage

# A private runtime keeps the counter independent of whichever Java happens to
# be installed on Windows. Link a compact image when packaged modules exist.
# GitHub's hosted Temurin 25 image omits them, so copy that complete JDK as the
# reliable fallback; it also retains source-file launch for backup decryption.
$runtime = Join-Path $Stage 'runtime'
$jmods = Join-Path $env:JAVA_HOME 'jmods'
if (Test-Path $jmods) {
    Invoke-Checked 'jlink.exe' @('--module-path', $jmods, '--add-modules', 'ALL-MODULE-PATH', '--bind-services', '--strip-debug', '--no-header-files', '--no-man-pages', '--compress=zip-6', '--output', $runtime)
} else {
    Write-Warning "Packaged JDK modules are unavailable; bundling the complete JDK from $env:JAVA_HOME"
    Copy-Item $env:JAVA_HOME $runtime -Recurse
}

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

if (-not $VcRedistPath) {
    $VcRedistPath = Join-Path $DependencyCache 'vc_redist.x64.exe'
    if (-not (Test-Path $VcRedistPath)) { Invoke-WebRequest $VcRedistUrl -OutFile $VcRedistPath }
}
Assert-DependencyHash $VcRedistPath $VcRedistSha256 'Visual C++ redistributable'
New-Item -ItemType Directory -Force (Join-Path $Stage 'vendor') | Out-Null
Copy-Item $VcRedistPath (Join-Path $Stage 'vendor\vc_redist.x64.exe')

# The staged tree is what a counter gets, so the question "can these binaries
# run at all?" is answered on the build machine too. postgres.exe -V prints and
# exits before it looks at anything else, so this asks only whether Windows can
# load it.
& (Join-Path $Stage 'postgresql\bin\postgres.exe') '-V' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The staged postgres.exe will not run on this build machine.' }

# The two variants install over each other by design — same AppId, same services,
# same ports — so the suffix is about telling the files apart, not about running
# both at once.
$suffix = if ($LaunchMode -eq 'Browser') { '-browser' } else { '' }
Invoke-Checked $InnoCompiler @("/DMyAppVersion=$Version", "/DStageDir=$Stage", "/DVariantSuffix=$suffix", (Join-Path $PSScriptRoot 'RadiancePOS.iss'))
$installer = Join-Path $BackendRoot "dist\Radiance-POS-Setup-$Version-x64$suffix.exe"
if (-not (Test-Path $installer)) { throw 'Inno Setup did not produce the expected installer.' }
$hash = (Get-FileHash $installer -Algorithm SHA256).Hash
Set-Content "$installer.sha256" "$hash  $([IO.Path]::GetFileName($installer))" -Encoding ascii
Write-Host "Built $installer ($LaunchMode)"
Write-Host "SHA256 $hash"
