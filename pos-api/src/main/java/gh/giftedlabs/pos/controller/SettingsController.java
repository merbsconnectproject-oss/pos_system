package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.SettingsRequest;
import gh.giftedlabs.pos.dto.SettingsView;
import gh.giftedlabs.pos.dto.AppearanceSettingsRequest;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.SettingsService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;

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

    /**
     * FR-SET-01: upload the business logo.
     *
     * <p>Multipart rather than a base64 field, because a logo is a file and a
     * 512 KB base64 string in a JSON settings body would also have to survive
     * every other settings save.
     */
    @PostMapping("/logo")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public SettingsView uploadLogo(@RequestParam("file") MultipartFile file,
                                   @AuthenticationPrincipal PosPrincipal actor,
                                   HttpServletRequest request) throws IOException {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a logo file");
        }
        return settings.storeLogo(file.getBytes(), file.getContentType(), actor, clientIp(request));
    }

    /** FR-SET-01: remove it, going back to no logo on the receipt. */
    @DeleteMapping("/logo")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public SettingsView removeLogo(@AuthenticationPrincipal PosPrincipal actor,
                                   HttpServletRequest request) {
        return settings.storeLogo(null, null, actor, clientIp(request));
    }

    /**
     * FR-SET-01: serve the logo.
     *
     * <p>Open to any signed-in user, like the rest of the settings read: the
     * receipt preview and every screen header show it.
     *
     * <p>Served with {@code Content-Disposition: inline} and a nosniff header,
     * and only ever with the content type the upload allowlisted. An SVG is an
     * executable document in a browser, so it is served as an attachment-safe
     * type rather than rendered in this origin's context.
     */
    @GetMapping("/logo")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<byte[]> logo() {
        return settings.logo()
                .map(stored -> ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_TYPE, stored.contentType())
                        .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                        .header("X-Content-Type-Options", "nosniff")
                        .header(HttpHeaders.CACHE_CONTROL, "private, max-age=60")
                        .body(stored.bytes()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
