package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.MovementRequest;
import gh.giftedlabs.pos.dto.StockView;
import gh.giftedlabs.pos.rules.MovementType;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.InventoryService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Stock — FR-INV.
 *
 * <p>Reading needs {@code stock.view}; moving stock needs the permission that
 * matches the reason. An adjustment is not a goods receipt and they are not
 * interchangeable, so {@code stock.adjust} and {@code stock.receive} are
 * checked separately rather than behind one "can touch stock" right.
 */
@RestController
@RequestMapping("/api/stock")
public class InventoryController {

    private final InventoryService inventory;

    public InventoryController(InventoryService inventory) {
        this.inventory = inventory;
    }

    @GetMapping("/outlet/{outletId}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public List<StockView> atOutlet(@PathVariable UUID outletId) {
        return inventory.atOutlet(outletId);
    }

    @GetMapping("/product/{productId}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public List<StockView> acrossOutlets(@PathVariable UUID productId) {
        return inventory.acrossOutlets(productId);
    }

    /** FR-INV-08: the dashboard's reorder list. */
    @GetMapping("/outlet/{outletId}/low")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public List<StockView> low(@PathVariable UUID outletId) {
        return inventory.lowAt(outletId);
    }

    /**
     * FR-INV-02/05: record a movement.
     *
     * <p>The permission is chosen by the movement type, and a reason is
     * required for the types that correct rather than transact.
     */
    @PostMapping("/movements")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('" + Permission.Codes.STOCK_ADJUST + "','"
            + Permission.Codes.STOCK_RECEIVE + "')")
    public StockView record(@Valid @RequestBody MovementRequest body,
                            @AuthenticationPrincipal PosPrincipal actor,
                            Authentication authentication, HttpServletRequest request) {
        requirePermissionFor(body.type(), authentication);

        if (body.type().requiresReason() && (body.reason() == null || body.reason().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A %s needs a reason".formatted(body.type().name().toLowerCase().replace('_', ' ')));
        }

        return inventory.record(body, actor, has(authentication, Permission.Codes.STOCK_OVERSELL), clientIp(request));
    }

    @PutMapping("/product/{productId}/outlet/{outletId}/reorder-level")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_ADJUST + "')")
    public StockView setReorderLevel(@PathVariable UUID productId, @PathVariable UUID outletId,
                                     @RequestParam BigDecimal value,
                                     @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return inventory.setReorderLevel(productId, outletId, value, actor, clientIp(request));
    }

    /**
     * A receipt is not an adjustment. Holding {@code stock.adjust} lets a
     * storekeeper correct a count; it must not also let them book in goods and
     * move the weighted average cost with them.
     */
    private void requirePermissionFor(MovementType type, Authentication authentication) {
        String needed = switch (type) {
            case RECEIPT, OPENING -> Permission.Codes.STOCK_RECEIVE;
            case ADJUSTMENT_IN, ADJUSTMENT_OUT, DAMAGE, LOSS -> Permission.Codes.STOCK_ADJUST;
            // Sales and voids are written by G through the service, not by a
            // person posting to this endpoint.
            case SALE, SALE_VOID -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Sales movements are written by the point of sale, not entered here");
        };
        if (!has(authentication, needed)) {
            throw new org.springframework.security.access.AccessDeniedException("Missing " + needed);
        }
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
