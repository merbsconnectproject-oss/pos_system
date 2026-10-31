package gh.giftedlabs.pos.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("Windows installed-app window")
class WindowsAppWindowTest {

    @Test
    @DisplayName("NFR-13 · setup isolates native tools from administrator profile temp paths")
    void setupOwnsItsTemporaryWorkspace() throws IOException {
        String onboarding = Files.readString(Path.of("packaging/windows/tools/onboard.ps1"));
        String build = Files.readString(Path.of("packaging/windows/build-installer.ps1"));
        String workflow = Files.readString(Path.of(".github/workflows/windows-package.yml"));

        assertTrue(onboarding.contains("Start-RadianceSetupTemp -DataRoot $DataRoot"));
        assertTrue(onboarding.indexOf("Start-RadianceSetupTemp -DataRoot $DataRoot")
                < onboarding.indexOf("$configuration = if ($ConfigFile)"),
                "temporary paths must be isolated before native tools or Add-Type run");
        assertTrue(Pattern.compile("finally\\s*\\{\\s*if \\(\\$null -ne \\$setupTemp\\) \\{ Stop-RadianceSetupTemp \\$setupTemp", Pattern.DOTALL)
                .matcher(onboarding).find(), "cleanup must run after success, cancellation and failure");
        assertTrue(build.contains("'setup-temp.ps1'"), "the installed helper must be staged");
        assertTrue(workflow.contains("packaging\\windows\\tests\\setup-paths.ps1"),
                "Windows CI must exercise real native tools against profile paths with spaces and ~1");
    }

    @Test
    @DisplayName("shortcuts and onboarding open the POS without browser chrome")
    void launcherUsesInstalledAppMode() throws IOException {
        String launcher = Files.readString(Path.of("packaging/windows/tools/open-pos.ps1"));
        String onboarding = Files.readString(Path.of("packaging/windows/tools/onboard.ps1"));

        assertTrue(launcher.contains("--app=$appUrl"));
        assertTrue(launcher.contains("--user-data-dir="));
        assertTrue(launcher.contains("--start-maximized"));
        // Through the console-free shim rather than powershell.exe directly —
        // launching the window used to flash a console on the counter screen.
        assertTrue(onboarding.contains("tools\\launch.vbs"));
        assertTrue(onboarding.contains("('\"{0}\"' -f (Join-Path $InstallRoot 'tools\\launch.vbs'))"),
                "Start-Process must preserve the spaced installation path as one argument");
        assertTrue(onboarding.contains("open-pos.ps1"));
        assertFalse(onboarding.contains("Start-Process 'http://127.0.0.1:8080/'"));
    }

    /**
     * Clicking an icon and getting a black flash and nothing else is the failure
     * a counter actually reports. Every path out of the launcher either opens
     * the POS or says why it could not, and the shortcuts carry no console at
     * all — asserted here because it cannot be asserted from Linux CI any other
     * way, and because it regressed once already.
     */
    @Test
    @DisplayName("no launch path can fail silently")
    void nothingFailsSilently() throws IOException {
        String launcher = Files.readString(Path.of("packaging/windows/tools/open-pos.ps1"));
        String onboarding = Files.readString(Path.of("packaging/windows/tools/onboard.ps1"));
        String installer = Files.readString(Path.of("packaging/windows/RadiancePOS.iss"));
        String shim = Files.readString(Path.of("packaging/windows/tools/launch.vbs"));

        // A dialog on every failure, not a silent exit.
        assertTrue(launcher.contains("MessageBox"), "the launcher must report failures");
        assertTrue(onboarding.contains("Show-SetupFailure"), "onboarding must report failures");

        // Nothing in the Start menu or on the desktop may invoke powershell.exe
        // directly: -WindowStyle Hidden is applied after the host already owns a
        // console, so the window is drawn before it is hidden.
        for (String line : installer.split("\n")) {
            String trimmed = line.trim();
            boolean shortcut = trimmed.startsWith("Name: \"{group}")
                    || trimmed.startsWith("Name: \"{commondesktop}");
            if (shortcut) {
                assertTrue(trimmed.contains("wscript.exe") && trimmed.contains("launch.vbs"),
                        "shortcut must go through the console-free shim: " + trimmed);
            }
        }

        // The everyday launcher still opens with no window at all.
        assertTrue(shim.contains("If visible Then style = 1 Else style = 0"),
                "the shim must be able to start PowerShell with no window");
    }

    /**
     * The package smoke test supplies a response file and runs with no desktop
     * operator. A success dialog in that path leaves Inno Setup waiting forever
     * for an OK click that can never happen.
     */
    @Test
    @DisplayName("silent onboarding completes without waiting for a desktop dialog")
    void silentOnboardingDoesNotShowACompletionDialog() throws IOException {
        String onboarding = Files.readString(Path.of("packaging/windows/tools/onboard.ps1"));
        String installer = Files.readString(Path.of("packaging/windows/RadiancePOS.iss"));

        String silentRun = installer.lines()
                .filter(line -> line.contains("Check: NeedsOnboarding and WizardSilent")
                        && line.contains("onboard.ps1"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("the installer must have a silent onboarding path"));
        assertTrue(silentRun.contains("-ConfigFile") && silentRun.contains("-NonInteractive"),
                "silent setup must identify itself with a response file: " + silentRun);

        // The structure, not the wording. The completion message now depends on
        // whether this computer started a business or joined one, and pinning one
        // sentence made a copy change look like a silent-install regression.
        Pattern guardedSuccessDialog = Pattern.compile(
                "if \\(-not \\$ConfigFile\\) \\{\\s*"
                        + "Add-Type -AssemblyName PresentationFramework\\b"
                        + ".*?\\[System\\.Windows\\.MessageBox\\]::Show\\(",
                Pattern.DOTALL);
        assertTrue(guardedSuccessDialog.matcher(onboarding).find(),
                "response-file onboarding must not block on the interactive success dialog");

        // And it cannot also be raised outside that guard, which the structural
        // match above would not notice on its own.
        assertEquals(1, onboarding.split("'Setup complete'", -1).length - 1,
                "the completion dialog must be raised in exactly one place, inside the -not $ConfigFile guard");
    }

    @Test
    @DisplayName("Windows packaging reads the frontend from the Gifted-Labs repository")
    void packagingUsesTheGiftedLabsFrontend() throws IOException {
        String workflow = Files.readString(Path.of(".github/workflows/windows-package.yml"));

        assertTrue(workflow.contains("repository: Gifted-Labs/radiance-pos-frontend"),
                "the package must not silently fall back to the old personal frontend repository");
        assertTrue(workflow.contains("ssh-key: ${{ secrets.POS_SYSTEM_DEPLOY_KEY }}"),
                "the private frontend checkout must use its read-only deploy key");
    }

    @Test
    @DisplayName("NFR-13 · service-account rights compile on Windows PowerShell")
    void serviceLogonRightDoesNotDuplicateInteropImport() throws IOException {
        String onboarding = Files.readString(Path.of("packaging/windows/tools/onboard.ps1"));

        assertTrue(onboarding.contains("Add-Type -Namespace 'Radiance' -Name 'Lsa' -MemberDefinition"),
                "setup must compile the narrow LSA helper used to grant Log on as a service");
        assertFalse(onboarding.contains("-UsingNamespace 'System.Runtime.InteropServices'"),
                "Add-Type -MemberDefinition imports interop itself; a duplicate using is a compiler error");
        assertTrue(onboarding.contains("LsaEnumerateAccountRights")
                        && onboarding.contains("[Radiance.Lsa]::HasRight"),
                "a successful LSA grant must be verified against live LSA policy, not a stale secedit export");
    }

    /**
     * Setup must raise its own UAC prompt and must be watchable.
     *
     * <p>Relying on somebody right-clicking and choosing "Run as administrator"
     * put the whole of onboarding behind a step nobody is told about, and
     * running it hidden meant that when it did fail the operator saw a shortcut
     * that did nothing at all. Both are asserted because both were reported from
     * a real counter.
     */
    @Test
    @DisplayName("setup elevates itself and runs where it can be watched")
    void setupElevatesAndIsVisible() throws IOException {
        String installer = Files.readString(Path.of("packaging/windows/RadiancePOS.iss"));
        String shim = Files.readString(Path.of("packaging/windows/tools/launch.vbs"));

        for (String entry : new String[] {"Configure or repair", "Restore a Radiance POS backup"}) {
            String line = installer.lines()
                    .filter(text -> text.contains(entry))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("no shortcut for " + entry));
            assertTrue(line.contains("/elevate"), entry + " must raise its own UAC prompt: " + line);
            assertTrue(line.contains("/show"), entry + " must be visible while it runs: " + line);
        }

        // ShellExecute raises the prompt; Run cannot, which is why a tool that
        // needed administrator rights could only ever fail and say so.
        assertTrue(shim.contains("\"runas\""), "elevation must go through ShellExecute runas");
        // A host told it may not interact cannot show the setup wizard. Asserted
        // against the line that builds the arguments, not the whole file — the
        // comment above it names the switch precisely to explain its absence.
        String psArgs = shim.lines()
                .filter(line -> line.trim().startsWith("psArgs ="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("the shim must build a PowerShell argument list"));
        assertFalse(psArgs.contains("-NonInteractive"),
                "the wizard is a WinForms dialog and needs an interactive host: " + psArgs);
        // A crash before a tool's own error handling must still reach the operator.
        assertTrue(shim.contains("Exit code: "), "a non-zero exit must be reported");
    }

    /**
     * A tool that has already spoken must not be spoken over.
     *
     * <p>The shim reports every unexpected exit, so a death before a tool's own
     * error handling still reaches the counter. That leaves one rule to keep:
     * a tool that has already put a dialog on screen exits 64, or the operator
     * is told the same thing twice — once usefully, once as an exit code.
     */
    @Test
    @DisplayName("a tool that showed its own dialog exits 64")
    void handledFailuresUseTheAgreedCode() throws IOException {
        String shim = Files.readString(Path.of("packaging/windows/tools/launch.vbs"));

        // Run takes one command line, so the host has to be named inside it.
        // Without this every shortcut that does not elevate — the desktop icon
        // among them — starts nothing at all.
        assertTrue(shim.contains("shell.Run(\"powershell.exe \" & psArgs"),
                "the shim must name the host it runs");
        assertTrue(shim.contains("If code <> 0 And code <> 64 Then"),
                "only 0 and the agreed handled-failure code may pass without a dialog");

        Pattern exitCode = Pattern.compile("\\bexit (\\d+)");
        for (String tool : new String[] {"open-pos.ps1", "onboard.ps1", "diagnostics.ps1", "restore-backup.ps1"}) {
            Matcher found = exitCode.matcher(Files.readString(Path.of("packaging/windows/tools/" + tool)));
            while (found.find()) {
                String code = found.group(1);
                assertTrue(code.equals("0") || code.equals("64"),
                        tool + " exits " + code + "; a handled failure must exit 64 and success 0");
            }
        }
    }

    /**
     * Setup must not be stopped by a folder an earlier attempt left behind.
     *
     * <p>Writing the generated PostgreSQL superuser password is the first thing
     * setup puts on disk, and it happens before setup has hardened any
     * permissions of its own. A counter reported it denied, which ends
     * onboarding with the database already initialised and no password stored
     * for it — the one state the operator cannot talk their way out of.
     */
    @Test
    @DisplayName("a secret that cannot be written is repaired, not surrendered to")
    void secretWritesRepairTheirOwnFolder() throws IOException {
        String onboarding = Files.readString(Path.of("packaging/windows/tools/onboard.ps1"));

        assertTrue(onboarding.contains("function Save-Secret"), "secret writes must go through one guarded path");
        // The read runs first. Guarding only the write left the failure that was
        // actually reported from a counter arriving from Get-Content, before any
        // of the repair below could run.
        assertTrue(onboarding.contains("function Read-Secret"), "secret reads must be guarded too");
        assertFalse(onboarding.contains("(Get-Content -Raw $PostgresAdminSecretPath)"),
                "the superuser password must not be read unguarded");
        assertFalse(onboarding.contains("(Get-Content -Raw $BackupEncryptionSecretPath)"),
                "the backup key must not be read unguarded");
        assertFalse(onboarding.contains("[IO.File]::WriteAllText($PostgresAdminSecretPath"),
                "the superuser password must not be written unguarded");
        assertFalse(onboarding.contains("[IO.File]::WriteAllText($BackupEncryptionSecretPath"),
                "the backup key must not be written unguarded");
        assertTrue(onboarding.contains("catch [System.UnauthorizedAccessException]"),
                "a denial must be caught rather than thrown at the operator");
        assertTrue(onboarding.contains("takeown.exe") && onboarding.contains("icacls.exe"),
                "setup must be able to repair a folder it cannot write");
        // A folder where a file belongs cannot be fixed by an ACL, and saying so
        // is the difference between a five-minute fix and a reinstall.
        assertTrue(onboarding.contains("is a folder where a file belongs"),
                "the folder-not-file case must name itself");
        // Native-command output is an array of lines, and PowerShell fills its
        // automatic $Matches only for a scalar left side — so -match here would
        // fail under StrictMode before the ACL result could be reported. One
        // helper now does that parsing for every icacls call.
        assertTrue(onboarding.contains("[regex]::Match(($output -join"),
                "multi-line icacls output must be parsed without PowerShell's scalar-only $Matches variable");
        assertFalse(onboarding.contains("$granted -match"),
                "using -match on native-command output leaves $Matches unset under StrictMode");
        assertTrue(onboarding.contains("function Invoke-IcaclsChecked"),
                "every final ACL operation must detect icacls partial failures");
        assertFalse(onboarding.contains("Invoke-Checked icacls.exe"),
                "generic exit-code checking misses icacls files it failed while continuing");
    }

    /**
     * PostgreSQL's one hard rule on Windows, stated by initdb itself: "the files
     * belonging to this database system will be owned by user X. This user must
     * also own the server process."
     *
     * <p>An installing administrator necessarily runs initdb, and no built-in
     * service account can ever be that administrator — so granting LocalSystem
     * or NetworkService access to the cluster was answering a question nobody
     * asked, and a clean Windows runner refused to start the service either way.
     * A dedicated local account owns the cluster and runs the service, which is
     * what PostgreSQL's own Windows installer has always done.
     */
    @Test
    @DisplayName("PostgreSQL is owned and run by one dedicated local account")
    void postgresServiceOwnsItsClusterAndLogsItsFailures() throws IOException {
        String onboarding = Files.readString(Path.of("packaging/windows/tools/onboard.ps1"));

        assertTrue(onboarding.contains("New-LocalUser"), "setup must create the account that owns the cluster");
        // Windows rejects a local account description over 48 characters, and
        // New-LocalUser validates it before doing anything — so an over-long one
        // ends setup after initdb has already built the cluster. It cost a full
        // CI cycle to learn, which is more than an assertion costs.
        Matcher description = Pattern.compile("-Description '([^']*)'").matcher(onboarding);
        assertTrue(description.find(), "the account must carry a description");
        assertTrue(description.group(1).length() <= 48,
                "Windows caps a local account description at 48 characters, and this is "
                        + description.group(1).length() + ": " + description.group(1));
        assertTrue(onboarding.contains("'/setowner'"), "that account must own the cluster before its first start");
        assertTrue(onboarding.contains("'-U', \".\\$DbAccount\", '-P', $dbPassword"),
                "PostgreSQL must run as the identity that owns its cluster");
        // CreateService does not grant this, and a service whose account lacks
        // it fails with error 1069 and nothing in any log setup writes.
        assertTrue(onboarding.contains("SeServiceLogonRight"),
                "the account must be granted the right to run as a service");
        // The account is in no group that Program Files grants anything to.
        assertTrue(onboarding.contains("'the Radiance POS program files'"),
                "the account must be able to read the PostgreSQL binaries");

        assertTrue(onboarding.contains("logging_collector = on")
                        && onboarding.contains("log_filename = 'postgresql.log'"),
                "service startup must leave a readable PostgreSQL log");
        assertFalse(onboarding.contains("'-S', 'auto', '-l'"),
                "pg_ctl ignores -l in Windows register mode");
        // A cluster that dies before opening that log writes nothing to it, and
        // that is the failure a clean machine actually produced.
        assertTrue(onboarding.contains("Get-WinEvent"),
                "a start failure with no log must fall back to the Windows event log");
    }

    /**
     * Two builds, one codebase.
     *
     * <p>The app window is what a till should look like; the ordinary browser is
     * the same application without the window dressing. Which one a counter gets
     * is stamped by the build and overridable on the machine, because the only
     * way to settle which belongs on a counter is to run both on real hardware.
     */
    @Test
    @DisplayName("the launch mode is a build variant the counter can override")
    void launchModeIsABuildVariant() throws IOException {
        String build = Files.readString(Path.of("packaging/windows/build-installer.ps1"));
        String installer = Files.readString(Path.of("packaging/windows/RadiancePOS.iss"));
        String launcher = Files.readString(Path.of("packaging/windows/tools/open-pos.ps1"));

        assertTrue(build.contains("[ValidateSet('AppWindow', 'Browser')]"),
                "the build must refuse a mode the launcher cannot read");
        assertTrue(build.contains("LAUNCH-MODE.txt"), "the build must stamp the mode it built");
        // Two artifacts that cannot be told apart are one artifact.
        assertTrue(build.contains("'-browser'"), "the browser build must be named differently");
        assertTrue(installer.contains("OutputBaseFilename=Radiance-POS-Setup-{#MyAppVersion}-x64{#VariantSuffix}"),
                "the suffix must reach the file Inno writes");

        assertTrue(launcher.contains("config\\launch-mode.txt"),
                "a counter must be able to switch mode without reinstalling");
        assertTrue(launcher.contains("Start-Process $appUrl"),
                "browser mode must open the same URL in the default browser");

        // Every path that opens the POS goes through the mode. Calling
        // Open-AppWindow directly is how one of them would quietly ignore the
        // build it came from.
        assertFalse(launcher.contains("Open-AppWindow; exit 0"),
                "the ready path must honour the launch mode");
        assertTrue(launcher.contains("Open-Pos; exit 0"),
                "the ready path must go through the launch mode");
    }

    /** A support call that starts with "which build is this?" has already lost. */
    @Test
    @DisplayName("the build stamps a version the counter can read back")
    void buildStampsAVersion() throws IOException {
        String build = Files.readString(Path.of("packaging/windows/build-installer.ps1"));
        String diagnostics = Files.readString(Path.of("packaging/windows/tools/diagnostics.ps1"));

        assertTrue(build.contains("VERSION.txt"), "the stage must carry a version stamp");
        assertTrue(build.contains("rev-parse"), "the stamp must name the commit it was built from");
        assertTrue(diagnostics.contains("VERSION.txt"), "diagnostics must read it back");
    }

    @Test
    @DisplayName("NFR-13 · installed shortcuts and setup carry the Radiance icon")
    void installedApplicationCarriesRadianceBranding() throws IOException {
        String build = Files.readString(Path.of("packaging/windows/build-installer.ps1"));
        String installer = Files.readString(Path.of("packaging/windows/RadiancePOS.iss"));

        assertTrue(build.contains("radiance-pos.ico"),
                "the branded icon must be copied into the install stage");
        assertTrue(installer.contains("SetupIconFile={#StageDir}\\radiance-pos.ico"),
                "the setup executable must carry the branded icon");
        assertTrue(installer.contains("UninstallDisplayIcon={app}\\radiance-pos.ico"),
                "Windows Installed Apps must show the branded icon");

        for (String line : installer.split("\n")) {
            String trimmed = line.trim();
            boolean shortcut = trimmed.startsWith("Name: \"{group}")
                    || trimmed.startsWith("Name: \"{commondesktop}");
            if (shortcut) {
                assertTrue(trimmed.contains("IconFilename: \"{app}\\radiance-pos.ico\""),
                        "every installed shortcut must carry the branded icon: " + trimmed);
            }
        }
    }
}
