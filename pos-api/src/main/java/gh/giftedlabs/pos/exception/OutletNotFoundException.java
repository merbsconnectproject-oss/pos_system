package gh.giftedlabs.pos.exception;

import java.util.UUID;

public class OutletNotFoundException extends RuntimeException {
    public OutletNotFoundException(UUID id) {
        super("No outlet %s".formatted(id));
    }
}
