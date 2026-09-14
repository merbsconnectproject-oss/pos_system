package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A staff account — FR-USER-01…08.
 *
 * <p>{@code effectivePermissions} is what the person can actually do: the role
 * baselines with their individual overrides applied. The overrides are sent
 * separately so the matrix can show <em>why</em> — a right that came from a
 * role reads differently from one granted to this person alone.
 *
 * <p>No hash of any kind appears here. A password or PIN hash on the wire is
 * an offline cracking target for anyone who can read one screen.
 */
public record UserView(
        UUID id,
        String username,
        String fullName,
        String email,
        String phone,
        List<String> roles,
        List<UUID> outletIds,
        List<String> effectivePermissions,
        /** Code → granted. Only where the person differs from their roles. */
        Map<String, Boolean> overrides,
        boolean active,
        boolean pinSet,
        Instant lastLoginAt,
        Instant createdAt) {

    public static UserView of(User user) {
        return new UserView(
                user.getId(), user.getUsername(), user.getFullName(), user.getEmail(), user.getPhone(),
                user.getRoles().stream().map(Role::key).sorted().toList(),
                List.copyOf(user.getOutletIds()),
                user.resolvePermissions().stream().map(Permission::code).sorted().toList(),
                user.getPermissionOverrides().entrySet().stream()
                        .collect(java.util.stream.Collectors.toMap(
                                entry -> entry.getKey().code(), Map.Entry::getValue)),
                user.isActive(),
                user.hasPin(),
                user.getLastLoginAt(),
                user.getCreatedAt());
    }
}
