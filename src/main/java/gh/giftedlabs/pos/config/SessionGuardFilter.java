package gh.giftedlabs.pos.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.dto.ApiError;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.SettingsService;
import gh.giftedlabs.pos.service.ShiftService;
import gh.giftedlabs.pos.service.impl.SessionServiceImpl;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;

@Component
public class SessionGuardFilter extends OncePerRequestFilter {
    private final UserRepository users;
    private final PosProperties properties;
    private final AuditService audit;
    private final ObjectMapper json;
    private final Clock clock;
    private final ObjectProvider<ShiftService> shifts;
    private final ObjectProvider<SettingsService> settings;

    public SessionGuardFilter(UserRepository users, PosProperties properties, AuditService audit,
                              ObjectMapper json, Clock clock, ObjectProvider<ShiftService> shifts,
                              ObjectProvider<SettingsService> settings) {
        this.users = users; this.properties = properties; this.audit = audit; this.json = json;
        this.clock = clock; this.shifts = shifts; this.settings = settings;
    }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                               FilterChain chain) throws ServletException, IOException {
        var security = SecurityContextHolder.getContext().getAuthentication();
        if (security == null || !(security.getPrincipal() instanceof PosPrincipal principal)) {
            chain.doFilter(request, response); return;
        }
        HttpSession session = request.getSession(false);
        var currentUser = users.findById(principal.userId()).filter(user -> user.isActive());
        if (session == null || currentUser.isEmpty()
                || currentUser.get().getCredentialsChangedAt().isAfter(principal.authenticatedAt())) {
            invalidate(session);
            reject(response, 401, "SESSION_INVALID", "Session is no longer valid"); return;
        }

        Instant now = clock.instant();
        Instant last = (Instant) session.getAttribute(SessionServiceImpl.LAST_ACTIVITY);
        boolean locked = Boolean.TRUE.equals(session.getAttribute(SessionServiceImpl.LOCKED));
        if (!locked && last != null && last.plus(idleTimeout()).isBefore(now)) {
            // FR-AUTH-05: with a shift open the terminal locks rather than signs
            // out, because signing out would abandon the drawer mid-count.
            //
            // Asked of the shift service rather than read from a session flag.
            // A flag set at sign-in is wrong the moment a shift is opened or
            // closed, and this only runs once a session has actually gone idle
            // — rarely, and never on the selling path.
            if (hasOpenShift(principal.userId())) {
                session.setAttribute(SessionServiceImpl.LOCKED, true);
                locked = true;
                audit.record(principal.userId(), "AUTH_SCREEN_IDLE_LOCKED", "user", principal.userId(),
                        null, null, principal.outletId(), null, request.getRemoteAddr());
            } else {
                invalidate(session);
                reject(response, 401, "SESSION_EXPIRED", "Your session expired due to inactivity"); return;
            }
        }

        String path = request.getRequestURI();
        boolean allowedWhileLocked = path.equals("/api/auth/unlock")
                || path.equals("/api/auth/sign-out") || path.equals("/api/auth/session")
                || path.equals("/api/auth/csrf");
        if (locked && !allowedWhileLocked) {
            reject(response, 423, "SCREEN_LOCKED", "Unlock the POS to continue"); return;
        }

        // FR-AUTH-07: an account still on the password an administrator chose
        // may sign in, change it, and nothing else. Enforced here rather than
        // by the screen, because a password two people know is a credential
        // either of them can use — including from a different browser.
        if (currentUser.get().mustChangePassword()
                && !path.equals("/api/auth/password") && !allowedWhileLocked) {
            reject(response, 403, "PASSWORD_CHANGE_REQUIRED",
                    "Choose your own password before continuing"); return;
        }
        if (!locked) session.setAttribute(SessionServiceImpl.LAST_ACTIVITY, now);
        chain.doFilter(request, response);
    }

    /**
     * FR-SET-06: the shop's idle lock, falling back to the configured default.
     *
     * <p>The fallback matters on the path this runs on. If settings cannot be
     * read the request should still be judged by some timeout rather than be
     * treated as fresh, which is what an exception here would amount to.
     */
    private java.time.Duration idleTimeout() {
        SettingsService service = settings.getIfAvailable();
        if (service == null) return properties.auth().idleTimeout();
        try {
            return service.idleTimeout();
        } catch (RuntimeException unavailable) {
            return properties.auth().idleTimeout();
        }
    }

    private boolean hasOpenShift(java.util.UUID cashierId) {
        ShiftService shiftService = shifts.getIfAvailable();
        return shiftService != null && shiftService.openShiftFor(cashierId).isPresent();
    }

    private void invalidate(HttpSession session) {
        SecurityContextHolder.clearContext();
        if (session != null) session.invalidate();
    }
    private void reject(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status); response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        json.writeValue(response.getOutputStream(), new ApiError(code, message, Map.of()));
    }
}
