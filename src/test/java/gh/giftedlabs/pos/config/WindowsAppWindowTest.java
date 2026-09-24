package gh.giftedlabs.pos.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("Windows installed-app window")
class WindowsAppWindowTest {

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
}
