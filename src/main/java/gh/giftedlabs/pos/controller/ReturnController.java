package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.ReturnRequest;
import gh.giftedlabs.pos.dto.ReturnView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.ReturnService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Returns and exchanges — {@code sale.refund}.
 *
 * <p>Reading a return needs the same right as making one. A credit note says what
 * the shop paid back and why, which is not a thing to leave open to anyone with a
 * session.
 */
@RestController
@RequestMapping("/api/returns")
public class ReturnController {

    private final ReturnService returns;

    public ReturnController(ReturnService returns) {
        this.returns = returns;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_REFUND + "')")
    public List<ReturnView> list(@RequestParam(required = false) UUID outletId,
                                 @RequestParam(defaultValue = "100") int limit) {
        return returns.list(outletId, limit);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_REFUND + "')")
    public ReturnView get(@PathVariable UUID id) {
        return returns.get(id);
    }

    /**
     * What may still be taken back against a receipt.
     *
     * <p>Asked before the screen offers anything, so a cashier is never shown a
     * quantity the shop will then refuse — and so the quantity already returned
     * is the server's answer rather than something the browser worked out.
     */
    @GetMapping("/returnable/{saleId}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_REFUND + "')")
    public ReturnView.Returnable returnable(@PathVariable UUID saleId) {
        return returns.returnable(saleId);
    }

    /**
     * Take the goods back.
     *
     * <p>{@code stock.oversell} is passed through for the same reason the sale
     * endpoint passes it: a write-off or a supplier return can take stock below
     * zero when the books and the shelf already disagree, and BR-9 says that is
     * a flagged movement rather than a refused one for those who may.
     */
    @PostMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_REFUND + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public ReturnView process(@Valid @RequestBody ReturnRequest body,
                              @AuthenticationPrincipal PosPrincipal actor,
                              Authentication authentication,
                              HttpServletRequest request) {
        boolean mayOversell = has(authentication, Permission.Codes.STOCK_OVERSELL);
        return returns.process(body, actor, mayOversell, clientIp(request));
    }

    private boolean has(Authentication authentication, String code) {
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(code::equals);
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
