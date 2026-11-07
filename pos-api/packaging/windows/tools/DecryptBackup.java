import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Source-file launcher used by restore-backup.ps1; no separate runtime is required. */
final class DecryptBackup {
    private static final byte[] MAGIC = "POSENC1".getBytes(StandardCharsets.US_ASCII);

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("input, output and key-file are required");
        byte[] payload = Files.readAllBytes(Path.of(args[0]));
        if (payload.length < MAGIC.length + 12 + 16
                || !Arrays.equals(MAGIC, Arrays.copyOf(payload, MAGIC.length))) {
            throw new IllegalArgumentException("not a Radiance POS encrypted backup");
        }
        String encoded = Files.readString(Path.of(args[2])).trim();
        byte[] key = encoded.matches("[0-9a-fA-F]{64}")
                ? HexFormat.of().parseHex(encoded)
                : Base64.getDecoder().decode(encoded);
        if (key.length != 32) throw new IllegalArgumentException("backup key must be 32 bytes");
        byte[] nonce = Arrays.copyOfRange(payload, MAGIC.length, MAGIC.length + 12);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
        byte[] clear = cipher.doFinal(Arrays.copyOfRange(payload, MAGIC.length + 12, payload.length));
        Files.write(Path.of(args[1]), clear);
    }
}
