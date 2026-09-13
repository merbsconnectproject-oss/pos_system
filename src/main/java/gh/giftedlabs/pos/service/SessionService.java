package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.SignInResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;

public interface SessionService {
    void establish(SignInResult result, HttpServletRequest request, HttpServletResponse response, String clientIp);
    SignInResult selectOutlet(UUID outletId, HttpServletRequest request, HttpServletResponse response, String clientIp);
    SignInResult current(HttpServletRequest request);
    void signOut(HttpServletRequest request, HttpServletResponse response, String clientIp);
    void lock(HttpServletRequest request, String clientIp);
    void unlock(String pin, HttpServletRequest request, String clientIp);
}
