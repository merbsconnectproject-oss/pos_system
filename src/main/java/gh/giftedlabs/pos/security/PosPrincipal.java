package gh.giftedlabs.pos.security;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

public record PosPrincipal(UUID userId, String username, UUID outletId, Instant authenticatedAt) implements Serializable {}
