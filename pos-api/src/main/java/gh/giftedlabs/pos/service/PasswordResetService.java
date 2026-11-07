package gh.giftedlabs.pos.service;

import java.util.UUID;

public interface PasswordResetService {
    void requestSelfService(String email, String clientIp);
    void confirmSelfService(String token, String newPassword, String clientIp);
    void resetByAdministrator(UUID actorId, UUID targetUserId, String newPassword, String clientIp);
}
