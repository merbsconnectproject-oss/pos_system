package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.ApiError;
import gh.giftedlabs.pos.exception.AuthenticationFailedException;
import gh.giftedlabs.pos.exception.OutletCodeTakenException;
import gh.giftedlabs.pos.exception.OutletNotFoundException;
import gh.giftedlabs.pos.exception.OutletNotPermittedException;
import gh.giftedlabs.pos.exception.CatalogueConflictException;
import gh.giftedlabs.pos.exception.CatalogueListException;
import gh.giftedlabs.pos.exception.IncorrectPinException;
import gh.giftedlabs.pos.exception.InsufficientStockException;
import gh.giftedlabs.pos.exception.ProductNotFoundException;
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
import org.springframework.web.server.ResponseStatusException;

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

    /** BR-6: receipt codes are unique per branch, so this is a conflict. */
    @ExceptionHandler(OutletCodeTakenException.class)
    public ResponseEntity<ApiError> onOutletCodeTaken(OutletCodeTakenException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiError("OUTLET_CODE_TAKEN", ex.getMessage(), Map.of("code", ex.getCode())));
    }

    /** FR-PROD-02/03: a duplicate SKU or barcode is a conflict, not bad input. */
    @ExceptionHandler(CatalogueConflictException.class)
    public ResponseEntity<ApiError> onCatalogueConflict(CatalogueConflictException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiError(ex.getCode(), ex.getMessage(), ex.getDetails()));
    }

    /** FR-PROD-05: a duplicate list name, or retiring an entry still in use. */
    @ExceptionHandler(CatalogueListException.class)
    public ResponseEntity<ApiError> onCatalogueList(CatalogueListException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiError(ex.getCode(), ex.getMessage(), ex.getDetails()));
    }

    /** BR-9: not enough stock, and the caller may not oversell. */
    @ExceptionHandler(InsufficientStockException.class)
    public ResponseEntity<ApiError> onInsufficientStock(InsufficientStockException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiError("INSUFFICIENT_STOCK", ex.getMessage(),
                        Map.of("productId", String.valueOf(ex.getProductId()),
                                "available", ex.getAvailable(),
                                "requested", ex.getRequested())));
    }

    @ExceptionHandler(ProductNotFoundException.class)
    public ResponseEntity<ApiError> onProductNotFound(ProductNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ApiError("PRODUCT_NOT_FOUND", "That product no longer exists", Map.of()));
    }

    /** BR-10: the floor cannot sit above retail — Product enforces the invariant. */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> onIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest()
                .body(new ApiError("INVALID_REQUEST", ex.getMessage(), Map.of()));
    }

    @ExceptionHandler(OutletNotFoundException.class)
    public ResponseEntity<ApiError> onOutletNotFound(OutletNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ApiError("OUTLET_NOT_FOUND", "That branch no longer exists", Map.of()));
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
     * A status a controller chose deliberately.
     *
     * <p>Without this the catch-all below swallows it: every
     * {@code ResponseStatusException} — including a plain 404 — would be logged
     * as an unhandled error and answered with 500, which is both wrong and
     * noisy in the log.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> onResponseStatus(ResponseStatusException ex) {
        HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        return ResponseEntity.status(status)
                .body(new ApiError(status.name(),
                        ex.getReason() == null ? status.getReasonPhrase() : ex.getReason(), Map.of()));
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
