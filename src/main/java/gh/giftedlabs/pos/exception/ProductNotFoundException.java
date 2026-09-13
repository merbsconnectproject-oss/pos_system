package gh.giftedlabs.pos.exception;

import java.util.UUID;

public class ProductNotFoundException extends RuntimeException {
    public ProductNotFoundException(UUID id) {
        super("No product %s".formatted(id));
    }
}
