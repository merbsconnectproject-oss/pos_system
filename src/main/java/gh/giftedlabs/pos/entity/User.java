package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.MapKeyEnumerated;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A person who signs in — FR-AUTH, FR-USER.
 *
 * <p>Permission resolution lives in {@link Role}, not here. This entity holds
 * only the assignment: which roles, which per-user overrides, which outlets.
 * Asking a {@code User} what it may do would put authorisation logic behind a
 * JPA proxy and make it untestable without a database.
 *
 * <p>NFR-8: password and PIN are hashed <strong>separately</strong>, each with
 * its own salt. A PIN is an approval primitive (FR-AUTH-02, BR-10), not a
 * second password, and the two must never be comparable.
 */
@Entity
@Table(name = "app_user")
public class User {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @NotBlank
    @Column(name = "username", nullable = false, unique = true)
    private String username;

    @Column(name = "email", unique = true)
    private String email;

    @NotBlank
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    /** 4–6 digits, hashed with its own salt — FR-AUTH-02. Null until set. */
    @Column(name = "pin_hash")
    private String pinHash;

    @NotBlank
    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "phone")
    private String phone;

    /** FR-AUTH-08: a deactivated user cannot sign in. BR-17: never deleted. */
    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "synced_at")
    private Instant syncedAt;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_role", joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "role_key", nullable = false)
    @Enumerated(EnumType.STRING)
    private Set<Role> roles = new HashSet<>();

    /**
     * FR-USER-03: per-user overrides on top of the role baseline.
     * {@code TRUE} grants a code the role lacks; {@code FALSE} revokes one it has.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_permission", joinColumns = @JoinColumn(name = "user_id"))
    @MapKeyColumn(name = "permission_code")
    @MapKeyEnumerated(EnumType.STRING)
    @Column(name = "granted", nullable = false)
    private Map<Permission, Boolean> permissionOverrides = new EnumMap<>(Permission.class);

    /** FR-AUTH-03: a user assigned to one outlet is placed there automatically. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_outlet", joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "outlet_id", nullable = false)
    private Set<UUID> outletIds = new HashSet<>();

    protected User() {
        // JPA
    }

    public User(String username, String fullName, String passwordHash) {
        this.username = username;
        this.fullName = fullName;
        this.passwordHash = passwordHash;
    }

    public UUID getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getPinHash() {
        return pinHash;
    }

    public void setPinHash(String pinHash) {
        this.pinHash = pinHash;
    }

    public boolean hasPin() {
        return pinHash != null && !pinHash.isBlank();
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public boolean isActive() {
        return active;
    }

    public void deactivate() {
        this.active = false;
    }

    public void activate() {
        this.active = true;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void recordLogin(Instant at) {
        this.lastLoginAt = at;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getSyncedAt() {
        return syncedAt;
    }

    public Set<Role> getRoles() {
        return roles;
    }

    public void assignRole(Role role) {
        this.roles.add(role);
    }

    public void removeRole(Role role) {
        this.roles.remove(role);
    }

    public Map<Permission, Boolean> getPermissionOverrides() {
        return permissionOverrides;
    }

    public void override(Permission permission, boolean granted) {
        this.permissionOverrides.put(permission, granted);
    }

    public void clearOverride(Permission permission) {
        this.permissionOverrides.remove(permission);
    }

    public Set<UUID> getOutletIds() {
        return outletIds;
    }

    public void assignOutlet(UUID outletId) {
        this.outletIds.add(outletId);
    }

    /**
     * The union of every assigned role's baseline, with this user's overrides
     * applied on top — FR-USER-03.
     *
     * <p>Delegates to {@link Role}; this method only combines. Keeping the rule
     * in the enum means the contract vectors test the same code path the server
     * authorises with.
     */
    public EnumSet<Permission> resolvePermissions() {
        EnumSet<Permission> granted = EnumSet.noneOf(Permission.class);
        roles.forEach(role -> granted.addAll(role.baseline()));

        permissionOverrides.forEach((permission, isGranted) -> {
            if (Boolean.TRUE.equals(isGranted)) {
                granted.add(permission);
            } else {
                granted.remove(permission);
            }
        });

        return granted;
    }
}
