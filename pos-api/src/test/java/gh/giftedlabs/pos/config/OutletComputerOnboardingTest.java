package gh.giftedlabs.pos.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The installer's outlet-computer path, read as text.
 *
 * <p>Crude on purpose and the only automated guard available: {@code
 * onboard.ps1} is PowerShell invoked by Inno Setup on a Windows counter, so a
 * Java build cannot execute a line of it. What it can do is hold the handful of
 * decisions that are invisible until a second shop is installed — and every one
 * of these failed on a real counter before it was pinned here.
 */
@DisplayName("Outlet computer onboarding")
class OutletComputerOnboardingTest {

    private static String onboarding() throws IOException {
        return Files.readString(Path.of("packaging/windows/tools/onboard.ps1"));
    }

    @Nested
    @DisplayName("business hierarchy")
    class BusinessHierarchy {

        @Test
        @DisplayName("FR-SET-01 · the organization is named before its owner and first outlet")
        void businessComesFirst() throws IOException {
            String script = onboarding();

            int business = script.indexOf("$tabs.TabPages.Add($businessPage)");
            int owner = script.indexOf("$tabs.TabPages.Add($ownerPage)");
            int outlet = script.indexOf("$tabs.TabPages.Add($shopPage)");
            assertTrue(business > 0 && owner > business && outlet > owner,
                    "new-business setup must read Business → Owner → First outlet");
        }

        @Test
        @DisplayName("FR-SET-01 · the organization name reaches the bootstrap service")
        void businessNameIsPersisted() throws IOException {
            String script = onboarding();

            assertTrue(script.contains("businessName = $businessName.Text.Trim()"));
            assertTrue(script.contains("pos.bootstrap.business-name=$(ConvertTo-PropertyValue"),
                    "the name collected before the outlet must reach business_settings");
        }
    }

    @Nested
    @DisplayName("joining rather than starting a business")
    class Joining {

        @Test
        @DisplayName("the stub outlet carries the enrollment file's own code")
        void stubOutletTakesHeadOfficeCode() throws IOException {
            // The subtle one. adoptHeadOfficeId finds the local outlet *by code*
            // and swaps in head office's id, carrying this till with it. Bootstrap
            // the stub as the shipped default RAD while the config says ACC and
            // the match misses: the counter keeps two outlets, its till stays on
            // the orphan, and the owner is handed a chooser on a counter PC.
            String script = onboarding();

            assertTrue(script.contains("outletCode = ([string]$file.outlet.code).Trim().ToUpperInvariant()"),
                    "outlet mode must take the outlet code from the enrollment file, never from a form");
            assertTrue(script.contains("pos.bootstrap.outlet-code=$(ConvertTo-PropertyValue $Config.outletCode)"),
                    "the stub outlet must be bootstrapped under that same code");
            assertTrue(script.contains("pos.deployment.outlet-code=$(ConvertTo-PropertyValue $Config.outletCode)"),
                    "outletCode(actor) reads this property first, so the pull is deterministic only when it is set");
        }

        @Test
        @DisplayName("no owner is created and no second outlet is invented")
        void createsNoOwner() throws IOException {
            String script = onboarding();

            assertTrue(script.contains("mode = 'outlet'"), "there must be an outlet installation mode");
            assertTrue(script.contains("ownerName = 'Setup (temporary)'"),
                    "the outlet path's account is a throwaway, not an owner the operator named");
            assertTrue(script.contains("$enrollUser = 'setup-' + (New-RandomSecret 8).ToLowerInvariant()"),
                    "its username must be generated, so nobody is ever told to use it");
        }

        @Test
        @DisplayName("the configuration is pulled before the setup credentials are stripped")
        void pullsBeforeStrippingCredentials() throws IOException {
            String script = onboarding();

            int pull = script.indexOf("$applied = Invoke-ConfigurationPull $configuration");
            int strip = script.indexOf("$syncEncryptionKey $false");
            assertTrue(pull > 0, "the outlet path must pull the published configuration");
            assertTrue(strip > 0, "setup must rewrite the configuration without bootstrap credentials");
            assertTrue(pull < strip,
                    "the pull signs in with the bootstrap account, so it cannot run after the account's "
                            + "password has been removed from the configuration");
        }

        @Test
        @DisplayName("an empty payload is not accepted as success")
        void refusesAnEmptyConfiguration() throws IOException {
            // Applied-without-error and applied-with-nothing look identical from
            // here, and the second leaves a counter nobody can sign in at.
            assertTrue(onboarding().contains("if ([int]$applied.users -le 0)"),
                    "setup must verify staff actually arrived");
        }
    }

    @Nested
    @DisplayName("the throwaway account")
    class ThrowawayAccount {

        @Test
        @DisplayName("is deactivated, never deleted")
        void isDeactivatedNotDeleted() throws IOException {
            // audit_log.actor_id is a foreign key to app_user and the pull writes
            // CONFIG_PULLED attributed to this very account, so a DELETE fails on
            // the constraint. Deactivating is also enough: sign-in rejects
            // inactive users.
            String script = onboarding();

            assertTrue(script.contains("update app_user set is_active = false where username ="),
                    "the enrollment account must be deactivated");
            assertFalse(script.contains("delete from app_user"),
                    "deleting it violates the audit log's foreign key");
        }

        @Test
        @DisplayName("is shut off before setup reports success")
        void isDisabledBeforeFinishing() throws IOException {
            String script = onboarding();

            int disable = script.indexOf("Disable-BootstrapAccount $configuration $databasePassword");
            int complete = script.indexOf("'Setup complete'");
            assertTrue(disable > 0, "setup must disable the account it enrolled with");
            assertTrue(disable < complete,
                    "adopting head office's outlet id re-points user_outlet onto it, so this account "
                            + "becomes a real owner at the branch — it must not outlive setup");
        }
    }

    @Nested
    @DisplayName("keys")
    class Keys {

        @Test
        @DisplayName("the sync key is written, and is not the backup key")
        void syncKeyIsSeparate() throws IOException {
            String script = onboarding();

            assertTrue(script.contains("POS_SYNC_ENCRYPTION_KEY=$(ConvertTo-PropertyValue $SyncEncryptionKey)"),
                    "without this the counter finds config/ACC.json and cannot decrypt a byte of it");
            assertTrue(script.contains("$SyncEncryptionSecretPath = Join-Path $SecretsRoot 'sync-encryption.secret'"),
                    "the sync key needs its own stored secret");
            assertFalse(script.contains("POS_SYNC_ENCRYPTION_KEY=$(ConvertTo-PropertyValue $BackupEncryptionKey)"),
                    "handing out the backup key as the sync key would give every counter the means "
                            + "to decrypt head office's database dumps");
        }

        @Test
        @DisplayName("an outlet computer takes the key from its enrollment file")
        void outletTakesTheKeyFromTheFile() throws IOException {
            assertTrue(onboarding().contains("Get-ConfigValue $configuration 'syncEncryptionKey'"),
                    "the business's key arrives in the file; a locally generated one cannot read anything");
        }
    }

    @Nested
    @DisplayName("installs that predate this mode")
    class Compatibility {

        @Test
        @DisplayName("a response file with no mode is read as a new business")
        void missingModeMeansBusiness() throws IOException {
            // Silent installs in the field have response files written before
            // outlet mode existed, and strict mode turns a missing property into
            // an error rather than a default.
            String script = onboarding();

            assertTrue(script.contains("function Get-SetupMode($Config)"), "mode must be resolved, not read raw");
            assertTrue(script.contains("return 'business'"), "an absent mode must mean a new business");
            assertTrue(script.contains("function Get-ConfigValue($Config, [string]$Name, $Default = '')"),
                    "fields added since must be read through a defaulting accessor");
            assertTrue(script.contains("Get-ConfigValue $Config 'terminalName' 'Counter 1'"),
                    "terminalName is new, so an older response file must still name its till");
        }
    }
}
