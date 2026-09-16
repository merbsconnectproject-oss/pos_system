package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.SettingsRequest;
import gh.giftedlabs.pos.dto.SettingsView;
import gh.giftedlabs.pos.dto.AppearanceSettingsRequest;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.SettingsService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * Business settings — FR-SET.
 *
 * <p>Reading is open to any signed-in user and writing is not. Every screen
 * needs the currency symbol, the accent and the receipt policy to render at
 * all, so withholding them from a cashier would leave them looking at a POS
 * with no idea what the numbers on it mean.
 */
@RestController
@RequestMapping("/api/settings")
public class SettingsController {

    private final SettingsService settings;

    public SettingsController(SettingsService settings) {
        this.settings = settings;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public SettingsView current() {
        return settings.current();
    }

    /** FR-SET-01 · FR-SET-03 · FR-SET-06 · `L-09`. */
    @PutMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public SettingsView update(@Valid @RequestBody SettingsRequest body,
                               @AuthenticationPrincipal PosPrincipal actor,
                               HttpServletRequest request) {
        return settings.update(body, actor, clientIp(request));
    }

    /** FR-SET-03: appearance is independently delegated without general-settings authority. */
    @PutMapping("/appearance")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_APPEARANCE + "')")
    public SettingsView updateAppearance(@Valid @RequestBody AppearanceSettingsRequest body,
                                         @AuthenticationPrincipal PosPrincipal actor,
                                         HttpServletRequest request) {
        return settings.updateAppearance(body, actor, clientIp(request));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
