package gh.giftedlabs.pos.service.impl;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Encrypts every small sync/configuration object before it reaches R2. */
final class OffsitePayloadCrypto {
    private static final byte[] MAGIC = "POSENC1".getBytes(StandardCharsets.US_ASCII);
    private OffsitePayloadCrypto() {}

    static byte[] encrypt(byte[] plain) {
        try {
            byte[] nonce = new byte[12]; new SecureRandom().nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, nonce));
            byte[] sealed = cipher.doFinal(plain);
            byte[] out = new byte[MAGIC.length + nonce.length + sealed.length];
            System.arraycopy(MAGIC, 0, out, 0, MAGIC.length);
            System.arraycopy(nonce, 0, out, MAGIC.length, nonce.length);
            System.arraycopy(sealed, 0, out, MAGIC.length + nonce.length, sealed.length);
            return out;
        } catch (Exception e) { throw new IllegalStateException("could not encrypt off-site payload: " + e.getMessage(), e); }
    }

    static byte[] decrypt(byte[] payload) {
        if (payload.length < MAGIC.length + 12 || !java.util.Arrays.equals(MAGIC, java.util.Arrays.copyOf(payload, MAGIC.length)))
            throw new IllegalStateException("off-site payload is not encrypted");
        try {
            byte[] nonce = java.util.Arrays.copyOfRange(payload, MAGIC.length, MAGIC.length + 12);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, nonce));
            return cipher.doFinal(java.util.Arrays.copyOfRange(payload, MAGIC.length + 12, payload.length));
        } catch (Exception e) { throw new IllegalStateException("could not decrypt off-site payload (check POS_BACKUP_ENCRYPTION_KEY)", e); }
    }

    private static byte[] key() {
        String value = System.getenv("POS_BACKUP_ENCRYPTION_KEY");
        if (value == null || value.isBlank()) throw new IllegalStateException("POS_BACKUP_ENCRYPTION_KEY is required");
        byte[] key = Base64.getDecoder().decode(value.trim());
        if (key.length != 32) throw new IllegalArgumentException("backup key must decode to 32 bytes");
        return key;
    }
}
