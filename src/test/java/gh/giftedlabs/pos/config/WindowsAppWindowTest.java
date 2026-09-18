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
        assertTrue(onboarding.contains("tools\\open-pos.ps1"));
        assertFalse(onboarding.contains("Start-Process 'http://127.0.0.1:8080/'"));
    }
}
