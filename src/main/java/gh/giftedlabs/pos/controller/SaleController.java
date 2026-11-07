package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.SaleRequest;
import gh.giftedlabs.pos.dto.SaleView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.OutletAccessGuard;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.SaleService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Selling — FR-POS, FR-PAY.
 *
 * <p>Completing a sale needs {@code pos.sell}. Voiding one needs
 * {@code sale.void}, which is a different authority: correcting a mistake after
 * the customer has left is not the same act as taking money.
 */
@RestController
@RequestMapping("/api/sales")
public class SaleController {

    private static final int MAX_PAGE = 200;

    private final SaleService sales;
    private final OutletAccessGuard outletAccess;

    public SaleController(SaleService sales, OutletAccessGuard outletAccess) {
        this.sales = sales;
        this.outletAccess = outletAccess;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.POS_SELL + "')")
    public SaleView complete(@Valid @RequestBody SaleRequest body,
                             @AuthenticationPrincipal PosPrincipal actor,
                             Authentication authentication, HttpServletRequest request) {
        outletAccess.assertVisible(body.outletId());
        boolean mayOversell = has(authentication, Permission.Codes.STOCK_OVERSELL);
        return redact(sales.complete(body, actor, mayOversell, clientIp(request)), authentication);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('" + Permission.Codes.POS_SELL + "','"
            + Permission.Codes.SALE_VIEW_ALL + "')")
    public SaleView get(@PathVariable UUID id, Authentication authentication) {
        return redact(sales.get(id), authentication);
    }

    /** FR-POS-18. */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('" + Permission.Codes.POS_SELL + "','"
            + Permission.Codes.SALE_VIEW_ALL + "')")
    public List<SaleView> recent(@RequestParam(required = false) UUID outletId,
                                 @RequestParam(required = false) String q,
                                 @RequestParam(defaultValue = "100") int limit,
                                 Authentication authentication) {
        outletId = outletAccess.scope(outletId);
        return sales.recent(outletId, q, Math.clamp(limit, 1, MAX_PAGE)).stream()
                .map(sale -> redact(sale, authentication))
                .toList();
    }

    /** BR-3 · FR-POS-19. */
    @PostMapping("/{id}/void")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_VOID + "')")
    public SaleView voidSale(@PathVariable UUID id, @Valid @RequestBody VoidRequest body,
                             @AuthenticationPrincipal PosPrincipal actor,
                             Authentication authentication, HttpServletRequest request) {
        return redact(sales.voidSale(id, body.reason(), actor, clientIp(request)), authentication);
    }

    @PostMapping("/{id}/reprint")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_REPRINT + "')")
    public SaleView reprint(@PathVariable UUID id, @AuthenticationPrincipal PosPrincipal actor,
                            Authentication authentication, HttpServletRequest request) {
        return redact(sales.reprint(id, actor, clientIp(request)), authentication);
    }

    public record VoidRequest(@NotBlank(message = "A void needs a reason") @Size(max = 300) String reason) {
    }

    /**
     * FR-RPT-05 · release gate 7: the frozen cost only reaches a caller who may
     * see cost.
     *
     * <p>Applied at the controller because that is where the caller's rights
     * are known; the service keeps one way of turning a Sale into a SaleView,
     * and two would eventually disagree about which one redacts.
     */
    private SaleView redact(SaleView sale, Authentication authentication) {
        return has(authentication, Permission.Codes.PRICE_VIEW_COST) ? sale : sale.withoutCost();
    }

    private boolean has(Authentication authentication, String code) {
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority).anyMatch(code::equals);
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
