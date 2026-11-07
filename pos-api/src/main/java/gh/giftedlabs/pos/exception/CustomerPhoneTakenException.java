package gh.giftedlabs.pos.exception;

import java.util.UUID;

/**
 * FR-CUST-03: that number already belongs to a customer.
 *
 * <p>Its own exception rather than the generic duplicate, because the client
 * can do something useful with it: the existing customer's id travels with it,
 * so the counter can be offered the record that already exists instead of
 * being told to think of a different phone number.
 */
public class CustomerPhoneTakenException extends RuntimeException {

    private final UUID existingId;
    private final String existingName;

    public CustomerPhoneTakenException(String phone, UUID existingId, String existingName) {
        super("%s is already saved for %s.".formatted(phone, existingName));
        this.existingId = existingId;
        this.existingName = existingName;
    }

    public UUID getExistingId() { return existingId; }
    public String getExistingName() { return existingName; }
}
