package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.service.PasswordResetNotifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;

/** Sends password-reset links through Resend's HTTPS API. */
@Service
public class ResendPasswordResetNotifier implements PasswordResetNotifier {
    private static final String RESEND_API = "https://api.resend.com";

    private final RestClient client;
    private final String apiKey;
    private final String from;

    @Autowired
    public ResendPasswordResetNotifier(RestClient.Builder builder, PosProperties properties) {
        this(builder, properties.auth().resendApiKey(), properties.auth().resendFrom());
    }

    ResendPasswordResetNotifier(RestClient.Builder builder, String apiKey, String from) {
        this.client = builder.baseUrl(RESEND_API)
                .defaultHeader(HttpHeaders.USER_AGENT, "Radiance-POS/1.0")
                .build();
        this.apiKey = apiKey;
        this.from = from;
    }

    @Override
    public void send(String email, String fullName, String resetUrl) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("RESEND_API_KEY is not configured");
        }

        String recipient = fullName == null || fullName.isBlank() ? "there" : fullName;
        String text = "Hello %s,%n%nUse this link to reset your Radiance POS password:%n%s%n%n"
                .formatted(recipient, resetUrl)
                + "This link expires soon and can only be used once. If you did not request it, ignore this email.";

        client.post()
                .uri("/emails")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .header("Idempotency-Key", idempotencyKey(resetUrl))
                .body(Map.of(
                        "from", from,
                        "to", email,
                        "subject", "Reset your Radiance POS password",
                        "text", text))
                .retrieve()
                .toBodilessEntity();
    }

    private String idempotencyKey(String resetUrl) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(resetUrl.getBytes(StandardCharsets.UTF_8));
            return "password-reset/" + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
