package gh.giftedlabs.pos.service.impl;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("Off-site payload encryption — NFR-6")
class OffsitePayloadCryptoTest {

    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);

    @Test
    @DisplayName("a protected configuration key encrypts and decrypts a payload")
    void roundTripsWithAnExplicitConfigurationKey() {
        byte[] clear = "counter snapshot".getBytes(StandardCharsets.UTF_8);

        byte[] encrypted = OffsitePayloadCrypto.encrypt(clear, KEY);

        assertThat(encrypted).isNotEqualTo(clear);
        assertThat(OffsitePayloadCrypto.decrypt(encrypted, KEY)).isEqualTo(clear);
    }

    @Test
    @DisplayName("an off-site payload cannot be written without an encryption key")
    void refusesAMissingKey() {
        assertThatThrownBy(() -> OffsitePayloadCrypto.encrypt(new byte[] {1}, ""))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("POS_BACKUP_ENCRYPTION_KEY");
    }
}
