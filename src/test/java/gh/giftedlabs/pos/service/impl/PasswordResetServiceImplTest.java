package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.entity.PasswordResetToken;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.exception.InvalidResetTokenException;
import gh.giftedlabs.pos.repository.PasswordResetTokenRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.service.*;
import org.junit.jupiter.api.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@DisplayName("Password reset — FR-AUTH-07")
class PasswordResetServiceImplTest {
    private UserRepository users;
    private PasswordResetTokenRepository tokens;
    private PasswordEncoder encoder;
    private PasswordResetNotifier notifier;
    private PasswordResetServiceImpl service;
    private User user;
    private UUID userId;
    private Instant now;

    @BeforeEach void setUp() {
        users = mock(UserRepository.class); tokens = mock(PasswordResetTokenRepository.class);
        encoder = mock(PasswordEncoder.class); notifier = mock(PasswordResetNotifier.class);
        AuditService audit = mock(AuditService.class); now = Instant.parse("2026-09-12T10:00:00Z");
        var auth = new PosProperties.Auth(5, Duration.ofMinutes(15), Duration.ofMinutes(15),
                Duration.ofMinutes(15), Duration.ofMinutes(30), "https://pos/reset-password", "", "pos@example.com");
        var props = new PosProperties(new PosProperties.Deployment(PosProperties.Mode.COUNTER, "INC", "01"),
                auth, new PosProperties.Consolidator(false, "", "", Duration.ofMinutes(15), Duration.ofSeconds(10),
                new PosProperties.Ingest("", Duration.ofMinutes(45))), new PosProperties.Web(""),
                // NFR-6: off in unit tests — nothing here should shell out to pg_dump.
                new PosProperties.Backup(false, java.time.Duration.ofMinutes(15), "backups",
                        java.time.Duration.ofDays(30), java.time.Duration.ofDays(2), "pg_dump",
                        java.time.Duration.ofMinutes(5),
                        new PosProperties.Offsite("", "", "", "", "auto", "")));
        service = new PasswordResetServiceImpl(users, tokens, encoder, notifier, audit, props,
                Clock.fixed(now, ZoneOffset.UTC));
        userId = UUID.randomUUID(); user = new User("ama", "Ama", "old");
        ReflectionTestUtils.setField(user, "id", userId); user.setEmail("ama@example.com");
    }

    @Nested @DisplayName("self-service reset")
    class SelfService {
        @Test void unknownEmailGetsSameSilentOutcome() {
            when(users.findByUsernameOrEmail(anyString())).thenReturn(Optional.empty());
            assertDoesNotThrow(() -> service.requestSelfService("missing@example.com", "127.0.0.1"));
            verifyNoInteractions(notifier);
        }
        @Test void activeUserGetsOpaqueExpiringLink() {
            when(users.findByUsernameOrEmail(user.getEmail())).thenReturn(Optional.of(user));
            service.requestSelfService(user.getEmail(), "127.0.0.1");
            verify(tokens).save(any(PasswordResetToken.class));
            verify(notifier).send(eq(user.getEmail()), eq("Ama"), startsWith("https://pos/reset-password?token="));
        }
        @Test void deliveryFailureDoesNotRevealThatAddressExists() {
            when(users.findByUsernameOrEmail(user.getEmail())).thenReturn(Optional.of(user));
            doThrow(new IllegalStateException("SMTP unavailable")).when(notifier)
                    .send(eq(user.getEmail()), anyString(), anyString());
            assertDoesNotThrow(() -> service.requestSelfService(user.getEmail(), "127.0.0.1"));
        }
        @Test void validTokenIsConsumedAndPasswordHashed() {
            PasswordResetToken token = new PasswordResetToken(userId, "hash", now.plusSeconds(60), now);
            when(tokens.findByTokenHash(anyString())).thenReturn(Optional.of(token));
            when(users.findById(userId)).thenReturn(Optional.of(user)); when(encoder.encode("new-password")).thenReturn("encoded");
            service.confirmSelfService("opaque", "new-password", "127.0.0.1");
            assertEquals("encoded", user.getPasswordHash()); assertFalse(token.isUsableAt(now.plusSeconds(1)));
        }
        @Test void expiredTokenIsRefused() {
            PasswordResetToken token = new PasswordResetToken(userId, "hash", now.minusSeconds(1), now.minusSeconds(60));
            when(tokens.findByTokenHash(anyString())).thenReturn(Optional.of(token));
            assertThrows(InvalidResetTokenException.class,
                    () -> service.confirmSelfService("opaque", "new-password", "127.0.0.1"));
        }
    }

    @Nested @DisplayName("administrator reset")
    class Administrator {
        @Test void cannotUseAdminRouteOnSelf() {
            assertThrows(AccessDeniedException.class,
                    () -> service.resetByAdministrator(userId, userId, "new-password", "127.0.0.1"));
        }
    }
}
