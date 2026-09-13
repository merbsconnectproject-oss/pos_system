package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.SignInRequest;
import gh.giftedlabs.pos.dto.SignInResult;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuthenticationService;
import gh.giftedlabs.pos.service.PasswordResetService;
import gh.giftedlabs.pos.service.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthenticationService authentication;
    private final SessionService sessions;
    private final PasswordResetService resets;

    public AuthController(AuthenticationService authentication, SessionService sessions, PasswordResetService resets) {
        this.authentication = authentication; this.sessions = sessions; this.resets = resets;
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }

    @PostMapping("/sign-in")
    @PreAuthorize("permitAll()")
    public SignInResult signIn(@Valid @RequestBody SignInRequest body,
            HttpServletRequest request, HttpServletResponse response) {
        SignInResult result = authentication.signIn(body, clientIp(request));
        sessions.establish(result, request, response, clientIp(request));
        return result;
    }

    @GetMapping("/session")
    public SignInResult current(HttpServletRequest request) { return sessions.current(request); }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/outlet/{outletId}")
    public SignInResult selectOutlet(@PathVariable UUID outletId, HttpServletRequest request,
                                     HttpServletResponse response) {
        return sessions.selectOutlet(outletId, request, response, clientIp(request));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/lock")
    public ResponseEntity<Void> lock(HttpServletRequest request) {
        sessions.lock(request, clientIp(request)); return ResponseEntity.noContent().build();
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/unlock")
    public ResponseEntity<Void> unlock(@Valid @RequestBody PinRequest body, HttpServletRequest request) {
        sessions.unlock(body.pin(), request, clientIp(request)); return ResponseEntity.noContent().build();
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/sign-out")
    public ResponseEntity<Void> signOut(HttpServletRequest request, HttpServletResponse response) {
        sessions.signOut(request, response, clientIp(request)); return ResponseEntity.noContent().build();
    }

    @PostMapping("/password-reset/request")
    @PreAuthorize("permitAll()")
    public ResponseEntity<Void> requestReset(@Valid @RequestBody ResetRequest body, HttpServletRequest request) {
        resets.requestSelfService(body.email(), clientIp(request)); return ResponseEntity.accepted().build();
    }

    @PostMapping("/password-reset/confirm")
    @PreAuthorize("permitAll()")
    public ResponseEntity<Void> confirmReset(@Valid @RequestBody ResetConfirm body, HttpServletRequest request) {
        resets.confirmSelfService(body.token(), body.newPassword(), clientIp(request));
        return ResponseEntity.noContent().build();
    }

    @PreAuthorize("hasAuthority('" + Permission.Codes.USER_MANAGE + "')")
    @PostMapping("/users/{userId}/password-reset")
    public ResponseEntity<Void> administratorReset(@AuthenticationPrincipal PosPrincipal actor,
            @PathVariable UUID userId, @Valid @RequestBody NewPassword body, HttpServletRequest request) {
        resets.resetByAdministrator(actor.userId(), userId, body.newPassword(), clientIp(request));
        return ResponseEntity.noContent().build();
    }

    public record PinRequest(@NotBlank @jakarta.validation.constraints.Pattern(regexp = "\\d{4,6}") String pin) {}
    public record ResetRequest(@NotBlank @Email @Size(max = 320) String email) {}
    public record ResetConfirm(@NotBlank String token, @NotBlank @Size(min = 8, max = 256) String newPassword) {}
    public record NewPassword(@NotBlank @Size(min = 8, max = 256) String newPassword) {}

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
