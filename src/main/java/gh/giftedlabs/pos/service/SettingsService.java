package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.SettingsRequest;
import gh.giftedlabs.pos.dto.SettingsView;
import gh.giftedlabs.pos.dto.AppearanceSettingsRequest;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Set;

/**
 * Business settings — FR-SET.
 *
 * <p>The read side is split in two on purpose. {@link #current()} is the whole
 * record for the settings screen; the named accessors below are what the rules
 * call, and they exist so a caller enforcing FR-CASH-06 asks for one number
 * rather than fetching a form and picking a field out of it.
 */
public interface SettingsService {

    SettingsView current();

    SettingsView update(SettingsRequest request, PosPrincipal actor, String clientIp);

    SettingsView updateAppearance(AppearanceSettingsRequest request, PosPrincipal actor, String clientIp);

    /** FR-CASH-06: variance past this needs a written explanation. */
    long cashVarianceThreshold();

    /** FR-INV-06: an adjustment worth more than this needs an approver. */
    long adjustmentApprovalThreshold();

    /** FR-AUTH-05: how long a session may sit idle before it locks. */
    Duration idleTimeout();

    /** How long automatic trading uploads wait between cloud requests. */
    Duration cloudSyncInterval();

    /**
     * FR-POS-10: the largest discount these roles may apply unapproved.
     *
     * <p>The most generous of the roles held wins. Someone who is both manager
     * and cashier has been trusted with the manager's ceiling, and taking the
     * lower of the two would make a promotion feel like a demotion.
     */
    BigDecimal discountCeiling(Set<Role> roles);
}
