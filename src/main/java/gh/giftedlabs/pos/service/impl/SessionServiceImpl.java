package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.SignInResult;
import gh.giftedlabs.pos.exception.IncorrectPinException;
import gh.giftedlabs.pos.exception.SessionAuthenticationException;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.AuthenticationService;
import gh.giftedlabs.pos.service.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.Map;
import java.util.UUID;

@Service
public class SessionServiceImpl implements SessionService {
    public static final String RESULT = "POS_SIGN_IN_RESULT";
    public static final String LOCKED = "POS_LOCKED";
    public static final String LAST_ACTIVITY = "POS_LAST_ACTIVITY";

    private final AuthenticationService authentication;
    private final UserRepository users;
    private final AuditService audit;
    private final Clock clock;
    private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();

    public SessionServiceImpl(AuthenticationService authentication, UserRepository users, AuditService audit, Clock clock) {
        this.authentication = authentication; this.users = users; this.audit = audit; this.clock = clock;
    }

    @Override public void establish(SignInResult result, HttpServletRequest request,
                                    HttpServletResponse response, String ip) {
        HttpSession old = request.getSession(false);
        if (old != null) old.invalidate();
        HttpSession session = request.getSession(true);
        save(result, request, response);
        session.setAttribute(RESULT, result);
        session.setAttribute(LOCKED, false);
        session.setAttribute(LAST_ACTIVITY, clock.instant());
        audit.record(result.userId(), "AUTH_SIGN_IN", "user", result.userId(), null,
                Map.of("username", result.username()), activeOutletId(result), null, ip);
    }

    @Override public SignInResult selectOutlet(UUID outletId, HttpServletRequest request,
                                               HttpServletResponse response, String ip) {
        PosPrincipal principal = principal();
        SignInResult result = authentication.selectOutlet(principal.userId(), outletId);
        save(result, request, response);
        request.getSession().setAttribute(RESULT, result);
        request.getSession().setAttribute(LAST_ACTIVITY, clock.instant());
        audit.record(principal.userId(), "AUTH_OUTLET_SELECTED", "outlet", outletId,
                null, null, outletId, null, ip);
        return result;
    }

    @Override public SignInResult current(HttpServletRequest request) {
        PosPrincipal principal = principal();
        var user = users.findById(principal.userId())
                .orElseThrow(() -> new SessionAuthenticationException("Session is no longer valid"));
        if (!user.isActive()) throw new SessionAuthenticationException("This account has been deactivated");
        HttpSession session = request.getSession(false);
        Object value = session == null ? null : session.getAttribute(RESULT);
        if (!(value instanceof SignInResult result)) throw new SessionAuthenticationException("Session is no longer valid");
        return result;
    }

    @Override public void signOut(HttpServletRequest request, HttpServletResponse response, String ip) {
        UUID userId = nullablePrincipalId();
        HttpSession session = request.getSession(false);
        SignInResult result = session != null && session.getAttribute(RESULT) instanceof SignInResult value ? value : null;
        if (userId != null) audit.record(userId, "AUTH_SIGN_OUT", "user", userId,
                null, null, activeOutletId(result), null, ip);
        SecurityContextHolder.clearContext();
        contexts.saveContext(SecurityContextHolder.createEmptyContext(), request, response);
        if (session != null) session.invalidate();
    }

    @Override public void lock(HttpServletRequest request, String ip) {
        PosPrincipal principal = principal();
        request.getSession().setAttribute(LOCKED, true);
        audit.record(principal.userId(), "AUTH_SCREEN_LOCKED", "user", principal.userId(),
                null, null, principal.outletId(), null, ip);
    }

    @Override public void unlock(String pin, HttpServletRequest request, String ip) {
        PosPrincipal principal = principal();
        if (!authentication.verifyOwnPin(principal.userId(), pin)) {
            audit.record(principal.userId(), "AUTH_SCREEN_UNLOCK_FAILED", "user", principal.userId(),
                    null, null, principal.outletId(), null, ip);
            throw new IncorrectPinException("PIN is incorrect");
        }
        request.getSession().setAttribute(LOCKED, false);
        request.getSession().setAttribute(LAST_ACTIVITY, clock.instant());
        audit.record(principal.userId(), "AUTH_SCREEN_UNLOCKED", "user", principal.userId(),
                null, null, principal.outletId(), null, ip);
    }

    private void save(SignInResult result, HttpServletRequest request, HttpServletResponse response) {
        var authorities = result.permissions().stream().map(SimpleGrantedAuthority::new).toList();
        var token = UsernamePasswordAuthenticationToken.authenticated(
                new PosPrincipal(result.userId(), result.username(), activeOutletId(result), clock.instant()), null, authorities);
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(token);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
    }

    private PosPrincipal principal() {
        Object value = SecurityContextHolder.getContext().getAuthentication() == null ? null
                : SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (value instanceof PosPrincipal principal) return principal;
        throw new SessionAuthenticationException("Sign in to continue");
    }
    private UUID nullablePrincipalId() {
        try { return principal().userId(); } catch (SessionAuthenticationException ignored) { return null; }
    }
    private UUID activeOutletId(SignInResult result) {
        return result == null || result.activeOutlet() == null ? null : result.activeOutlet().id();
    }
}
