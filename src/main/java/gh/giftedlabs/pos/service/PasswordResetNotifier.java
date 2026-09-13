package gh.giftedlabs.pos.service;

public interface PasswordResetNotifier {
    void send(String email, String fullName, String resetUrl);
}
