package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.SignInResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;

public interface SessionService {
    void establish(SignInResult result, HttpServletRequest request, HttpServletResponse response, String clientIp);
    SignInResult selectOutlet(UUID outletId, HttpServletRequest request, HttpServletResponse response, String clientIp);
    SignInResult current(HttpServletRequest request);

    /**
     * FR-AUTH-07: re-stamp this session after its owner changed their own
     * password.
     *
     * <p>Changing a password moves {@code credentialsChangedAt}, which is what
     * signs out every other browser holding the old one. This session is the
     * one that just proved the old password and chose the new one, so it is
     * stamped forward instead of being thrown out — otherwise choosing a
     * password would log you out for having chosen it.
     */
    SignInResult refreshCredentials(HttpServletRequest request, HttpServletResponse response);
    void signOut(HttpServletRequest request, HttpServletResponse response, String clientIp);
    void lock(HttpServletRequest request, String clientIp);
    void unlock(String pin, HttpServletRequest request, String clientIp);
}
