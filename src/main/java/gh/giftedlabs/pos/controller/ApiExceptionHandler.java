package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.ApiError;
import gh.giftedlabs.pos.exception.AuthenticationFailedException;
import gh.giftedlabs.pos.exception.OutletNotPermittedException;
import gh.giftedlabs.pos.exception.IncorrectPinException;
import gh.giftedlabs.pos.exception.InvalidResetTokenException;
import gh.giftedlabs.pos.exception.SessionAuthenticationException;
import org.springframework.security.access.AccessDeniedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * One place where domain failures become HTTP responses.
 *
 * <p>Open/closed in practice: a new domain exception adds a handler here and
 * changes no controller. Controllers never build error payloads, so an error
 * shape cannot drift between endpoints.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    /**
     * FR-AUTH-06, FR-AUTH-08.
     *
     * <p>This is where the enumeration trade-off is settled.
     * {@code BAD_CREDENTIALS} covers both "no such user" and "wrong password"
     * and renders one message, so the endpoint cannot be used to discover which
     * usernames exist. {@code ACCOUNT_DEACTIVATED} is distinguishable because
     * FR-AUTH-08 demands a clear message — and the service only raises it after
     * the password matched, so it is shown to the account owner alone.
     */
    @ExceptionHandler(AuthenticationFailedException.class)
    public ResponseEntity<ApiError> onAuthenticationFailed(AuthenticationFailedException ex) {
        Map<String, Object> details = new LinkedHashMap<>();

        HttpStatus status = switch (ex.getReason()) {
            case RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
            case ACCOUNT_DEACTIVATED -> HttpStatus.FORBIDDEN;
            case BAD_CREDENTIALS -> HttpStatus.UNAUTHORIZED;
        };

        // A-02: the sign-in screen shows attempts remaining.
        if (ex.getReason() == AuthenticationFailedException.Reason.BAD_CREDENTIALS) {
            details.put("attemptsRemaining", ex.getAttemptsRemaining());
        }

        HttpHeaders headers = new HttpHeaders();
        if (ex.getReason() == AuthenticationFailedException.Reason.RATE_LIMITED) {
            long seconds = Math.max(1, ex.getRetryAfter().toSeconds());
            headers.add(HttpHeaders.RETRY_AFTER, Long.toString(seconds));
            details.put("retryAfterSeconds", seconds);
        }

        return ResponseEntity.status(status)
                .headers(headers)
                .body(new ApiError(ex.getReason().name(), ex.getMessage(), details));
    }

    /** Authenticated, but not for that outlet — 403, not 401. */
    @ExceptionHandler(OutletNotPermittedException.class)
    public ResponseEntity<ApiError> onOutletNotPermitted(OutletNotPermittedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ApiError("OUTLET_NOT_PERMITTED", ex.getMessage(),
                        Map.of("outletId", String.valueOf(ex.getOutletId()))));
    }

    @ExceptionHandler(SessionAuthenticationException.class)
    public ResponseEntity<ApiError> onSessionAuthentication(SessionAuthenticationException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ApiError("SESSION_INVALID", ex.getMessage(), Map.of()));
    }

    /**
     * A mistyped unlock PIN. The screen stays locked and the session stays
     * alive, so this must not look like SESSION_INVALID — FR-AUTH-04.
     */
    @ExceptionHandler(IncorrectPinException.class)
    public ResponseEntity<ApiError> onIncorrectPin(IncorrectPinException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ApiError("PIN_INCORRECT", ex.getMessage(), Map.of()));
    }

    @ExceptionHandler(InvalidResetTokenException.class)
    public ResponseEntity<ApiError> onInvalidResetToken(InvalidResetTokenException ex) {
        return ResponseEntity.badRequest().body(new ApiError("RESET_TOKEN_INVALID", ex.getMessage(), Map.of()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> onAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ApiError("ACCESS_DENIED", "You do not have permission to do that", Map.of()));
    }

    /** Bean Validation failures, rendered per field so the form can mark them. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> onValidationFailed(MethodArgumentNotValidException ex) {
        Map<String, Object> fields = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(error -> fields.putIfAbsent(error.getField(), error.getDefaultMessage()));

        return ResponseEntity.badRequest()
                .body(new ApiError("VALIDATION_FAILED", "Check the highlighted fields", fields));
    }

    /**
     * The catch-all. Logs the cause and returns nothing about it — a stack
     * trace or SQL fragment in a response body is an information leak.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> onUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("INTERNAL_ERROR",
                        "Something went wrong. Try again, and tell a manager if it keeps happening.",
                        Map.of()));
    }
}
