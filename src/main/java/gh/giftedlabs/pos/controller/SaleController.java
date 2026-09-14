package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.SaleRequest;
import gh.giftedlabs.pos.dto.SaleView;
import gh.giftedlabs.pos.rules.Permission;
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

    public SaleController(SaleService sales) {
        this.sales = sales;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.POS_SELL + "')")
    public SaleView complete(@Valid @RequestBody SaleRequest body,
                             @AuthenticationPrincipal PosPrincipal actor,
                             Authentication authentication, HttpServletRequest request) {
        boolean mayOversell = has(authentication, Permission.Codes.STOCK_OVERSELL);
        return sales.complete(body, actor, mayOversell, clientIp(request));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('" + Permission.Codes.POS_SELL + "','"
            + Permission.Codes.SALE_VIEW_ALL + "')")
    public SaleView get(@PathVariable UUID id) {
        return sales.get(id);
    }

    /** FR-POS-18. */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('" + Permission.Codes.POS_SELL + "','"
            + Permission.Codes.SALE_VIEW_ALL + "')")
    public List<SaleView> recent(@RequestParam(required = false) UUID outletId,
                                 @RequestParam(required = false) String q,
                                 @RequestParam(defaultValue = "100") int limit) {
        return sales.recent(outletId, q, Math.clamp(limit, 1, MAX_PAGE));
    }

    /** BR-3 · FR-POS-19. */
    @PostMapping("/{id}/void")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_VOID + "')")
    public SaleView voidSale(@PathVariable UUID id, @Valid @RequestBody VoidRequest body,
                             @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return sales.voidSale(id, body.reason(), actor, clientIp(request));
    }

    public record VoidRequest(@NotBlank(message = "A void needs a reason") @Size(max = 300) String reason) {
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
