package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.entity.PasswordResetToken;
import gh.giftedlabs.pos.exception.InvalidResetTokenException;
import gh.giftedlabs.pos.repository.PasswordResetTokenRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.PasswordResetNotifier;
import gh.giftedlabs.pos.service.PasswordResetService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Service
public class PasswordResetServiceImpl implements PasswordResetService {
    private static final Logger log = LoggerFactory.getLogger(PasswordResetServiceImpl.class);
    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final PasswordEncoder encoder;
    private final PasswordResetNotifier notifier;
    private final AuditService audit;
    private final PosProperties properties;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public PasswordResetServiceImpl(UserRepository users, PasswordResetTokenRepository tokens,
            @Qualifier("passwordEncoder") PasswordEncoder encoder, PasswordResetNotifier notifier, AuditService audit,
            PosProperties properties, Clock clock) {
        this.users = users; this.tokens = tokens; this.encoder = encoder; this.notifier = notifier;
        this.audit = audit; this.properties = properties; this.clock = clock;
    }

    @Override @Transactional
    public void requestSelfService(String email, String ip) {
        users.findByUsernameOrEmail(email).filter(user -> user.isActive() && user.getEmail() != null).ifPresent(user -> {
            byte[] bytes = new byte[32]; random.nextBytes(bytes);
            String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            tokens.save(new PasswordResetToken(user.getId(), digest(raw),
                    clock.instant().plus(properties.auth().resetTokenTtl()), clock.instant()));
            try {
                notifier.send(user.getEmail(), user.getFullName(),
                        properties.auth().resetBaseUrl() + "?token=" + raw);
            } catch (RuntimeException deliveryFailure) {
                // The public response must remain identical for known and unknown
                // addresses. Operators still get a clear, searchable failure.
                log.error("Password-reset email delivery failed for user {}", user.getId(), deliveryFailure);
                audit.record(user.getId(), "AUTH_PASSWORD_RESET_DELIVERY_FAILED", "user", user.getId(),
                        null, null, null, null, ip);
            }
            audit.record(user.getId(), "AUTH_PASSWORD_RESET_REQUESTED", "user", user.getId(),
                    null, null, null, null, ip);
        });
    }

    @Override @Transactional
    public void confirmSelfService(String raw, String newPassword, String ip) {
        PasswordResetToken token = tokens.findByTokenHash(digest(raw))
                .filter(value -> value.isUsableAt(clock.instant())).orElseThrow(InvalidResetTokenException::new);
        var user = users.findById(token.getUserId()).filter(value -> value.isActive())
                .orElseThrow(InvalidResetTokenException::new);
        user.changePassword(encoder.encode(newPassword), clock.instant());
        token.consume(clock.instant());
        audit.record(user.getId(), "AUTH_PASSWORD_RESET_COMPLETED", "user", user.getId(),
                null, null, null, null, ip);
    }

    @Override @Transactional
    public void resetByAdministrator(UUID actorId, UUID targetId, String newPassword, String ip) {
        if (actorId.equals(targetId)) throw new AccessDeniedException("Use your own password-change flow");
        var user = users.findById(targetId).orElseThrow(() -> new IllegalArgumentException("User not found"));
        user.changePassword(encoder.encode(newPassword), clock.instant());
        audit.record(actorId, "AUTH_PASSWORD_RESET_BY_ADMIN", "user", targetId,
                null, Map.of("passwordReset", true), null, null, ip);
    }

    private String digest(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
