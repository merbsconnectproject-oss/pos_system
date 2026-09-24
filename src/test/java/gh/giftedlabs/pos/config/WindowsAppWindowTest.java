package gh.giftedlabs.pos.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

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

        // 0 is the hidden window style; anything else draws one.
        assertTrue(shim.contains("shell.Run(command, 0, True)"),
                "the shim must start PowerShell with no window");
    }
}
