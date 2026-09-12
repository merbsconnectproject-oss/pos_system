package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.SignInRequest;
import gh.giftedlabs.pos.dto.SignInResult;
import gh.giftedlabs.pos.service.AuthenticationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Sign-in and outlet placement — FR-AUTH-01, FR-AUTH-03.
 *
 * <p>Thin by design. It validates the request shape, resolves the caller's IP
 * for the audit trail, and delegates. No branching on business rules lives
 * here; failures surface as exceptions and {@link ApiExceptionHandler} decides
 * what the client is told.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationService authentication;

    public AuthController(AuthenticationService authentication) {
        this.authentication = authentication;
    }

    @PostMapping("/sign-in")
    public ResponseEntity<SignInResult> signIn(
            @Valid @RequestBody SignInRequest request,
            HttpServletRequest http) {
        return ResponseEntity.ok(authentication.signIn(request, clientIp(http)));
    }

    /** FR-AUTH-03: the explicit choice made by a user assigned to several outlets. */
    @PostMapping("/outlet/{outletId}")
    public ResponseEntity<SignInResult> selectOutlet(
            @PathVariable @NotNull UUID outletId,
            @Valid @RequestBody OutletSelectionRequest request) {
        return ResponseEntity.ok(authentication.selectOutlet(request.userId(), outletId));
    }

    public record OutletSelectionRequest(@NotNull UUID userId) {
    }

    /**
     * FR-AUDIT-01 wants the caller's IP on audit entries.
     *
     * <p>{@code X-Forwarded-For} is honoured because the consolidator sits
     * behind a proxy. On a counter PC there is no proxy and the header is
     * absent, so the remote address is used — which is the honest value there.
     */
    private String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return http.getRemoteAddr();
    }
}
