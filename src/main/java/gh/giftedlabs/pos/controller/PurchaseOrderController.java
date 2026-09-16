package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.PurchaseOrderRequest;
import gh.giftedlabs.pos.dto.PurchaseOrderView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.PurchaseOrderService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Purchase orders — FR-SUP-08.
 *
 * <p>Gated on {@code supplier.manage}, which is the code the screen inventory
 * already assigns to this workspace and which storekeepers and managers hold:
 * ordering is part of keeping the shelves full, not an administrative act.
 *
 * <p>Note what is <em>not</em> here: no delete, and no endpoint that records a
 * delivery. Goods arrive through {@code /api/goods-receipts}, naming the order
 * they are against — one path writes stock, and an order is only ever the
 * document explaining why somebody expected it.
 */
@RestController
@RequestMapping("/api/purchase-orders")
public class PurchaseOrderController {

    private final PurchaseOrderService orders;

    public PurchaseOrderController(PurchaseOrderService orders) {
        this.orders = orders;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public List<PurchaseOrderView> list(@RequestParam(required = false) UUID outletId,
                                        @RequestParam(required = false) String status,
                                        @RequestParam(required = false) UUID supplierId,
                                        @RequestParam(defaultValue = "200") int limit) {
        return orders.list(outletId, status, supplierId, limit);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public PurchaseOrderView get(@PathVariable UUID id) {
        return orders.get(id);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public PurchaseOrderView create(@Valid @RequestBody PurchaseOrderRequest request,
                                    @AuthenticationPrincipal PosPrincipal actor,
                                    HttpServletRequest http) {
        return orders.create(request, actor, clientIp(http));
    }

    /** Draft only — a sent order is a copy the supplier holds. */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public PurchaseOrderView amend(@PathVariable UUID id,
                                   @Valid @RequestBody PurchaseOrderRequest request,
                                   @AuthenticationPrincipal PosPrincipal actor,
                                   HttpServletRequest http) {
        return orders.amend(id, request, actor, clientIp(http));
    }

    @PostMapping("/{id}/send")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public PurchaseOrderView send(@PathVariable UUID id,
                                  @AuthenticationPrincipal PosPrincipal actor,
                                  HttpServletRequest http) {
        return orders.send(id, actor, clientIp(http));
    }

    /**
     * No more deliveries expected.
     *
     * <p>A reason is required when anything is still outstanding — closing an
     * order short is a decision about a supplier who did not deliver, and the
     * shop will want to know who accepted it.
     */
    @PostMapping("/{id}/close")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public PurchaseOrderView close(@PathVariable UUID id,
                                   @RequestBody(required = false) Reason reason,
                                   @AuthenticationPrincipal PosPrincipal actor,
                                   HttpServletRequest http) {
        return orders.close(id, reason == null ? null : reason.reason(), actor, clientIp(http));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public PurchaseOrderView cancel(@PathVariable UUID id,
                                    @Valid @RequestBody Reason reason,
                                    @AuthenticationPrincipal PosPrincipal actor,
                                    HttpServletRequest http) {
        return orders.cancel(id, reason.reason(), actor, clientIp(http));
    }

    /** Why an order ended the way it did. */
    public record Reason(@Size(max = 300) String reason) {
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return request.getRemoteAddr();
    }
}
