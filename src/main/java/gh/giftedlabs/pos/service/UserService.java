package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.UserRequest;
import gh.giftedlabs.pos.dto.UserView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.UUID;

/** Staff accounts, roles and individual permissions — FR-USER, BR-16. */
public interface UserService {

    List<UserView> list(boolean includeInactive);

    UserView get(UUID id);

    UserView create(UserRequest request, PosPrincipal actor, String clientIp);

    UserView update(UUID id, UserRequest request, PosPrincipal actor, String clientIp);

    /**
     * FR-USER-03 · BR-16: grant or withhold one permission for one person.
     *
     * @param granted true to grant, false to withhold, null to fall back to
     *                whatever their roles give them — which is not the same as
     *                withholding it
     */
    UserView setPermission(UUID id, String code, Boolean granted, PosPrincipal actor, String clientIp);

    /** FR-USER-07 · BR-17. */
    UserView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp);

    /** `J-06`: what the permission matrix is drawn from. */
    List<PermissionInfo> permissionCatalogue();

    List<RoleInfo> roleCatalogue();

    /** {@code futureStage} marks a code reserved for Stage 2 or 3 — see {@code Permission}. */
    record PermissionInfo(String code, String group, String description, boolean futureStage) {
    }

    record RoleInfo(String key, List<String> baseline) {
    }
}
