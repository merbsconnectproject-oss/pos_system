package gh.giftedlabs.pos.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.dto.ApiError;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.impl.SessionServiceImpl;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
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

    public SessionGuardFilter(UserRepository users, PosProperties properties, AuditService audit,
                              ObjectMapper json, Clock clock) {
        this.users = users; this.properties = properties; this.audit = audit; this.json = json; this.clock = clock;
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
        if (!locked && last != null && last.plus(properties.auth().idleTimeout()).isBefore(now)) {
            if (Boolean.TRUE.equals(session.getAttribute(SessionServiceImpl.OPEN_SHIFT))) {
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
        if (!locked) session.setAttribute(SessionServiceImpl.LAST_ACTIVITY, now);
        chain.doFilter(request, response);
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
