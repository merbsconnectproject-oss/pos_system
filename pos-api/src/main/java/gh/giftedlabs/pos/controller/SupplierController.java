package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.security.OutletAccessGuard;

import gh.giftedlabs.pos.dto.*;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.GoodsReceiptService;
import gh.giftedlabs.pos.service.SupplierService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Suppliers and deliveries — FR-SUP.
 *
 * <p>Reading needs {@code stock.view}: the goods receipt screen has to offer a
 * supplier list to anyone allowed to receive. Managing the directory needs
 * {@code supplier.manage}, and booking goods in needs {@code stock.receive},
 * because keeping a supplier's phone number current is not the same authority
 * as moving stock and cost.
 */
@RestController
@RequestMapping("/api")
public class SupplierController {

    private final SupplierService suppliers;
    private final GoodsReceiptService receipts;

    private final OutletAccessGuard outletAccess;

    public SupplierController(SupplierService suppliers, GoodsReceiptService receipts, OutletAccessGuard outletAccess) {
        this.suppliers = suppliers;
        this.outletAccess = outletAccess;
        this.receipts = receipts;
    }

    @GetMapping("/suppliers")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public List<SupplierView> list(@RequestParam(defaultValue = "false") boolean includeInactive) {
        return suppliers.list(includeInactive);
    }

    @GetMapping("/suppliers/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public SupplierView get(@PathVariable UUID id) {
        return suppliers.get(id);
    }

    @PostMapping("/suppliers")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public SupplierView create(@Valid @RequestBody SupplierRequest body,
                               @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return suppliers.create(body, actor, clientIp(request));
    }

    @PutMapping("/suppliers/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public SupplierView update(@PathVariable UUID id, @Valid @RequestBody SupplierRequest body,
                               @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return suppliers.update(id, body, actor, clientIp(request));
    }

    @PostMapping("/suppliers/{id}/active")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SUPPLIER_MANAGE + "')")
    public SupplierView setActive(@PathVariable UUID id, @RequestParam boolean value,
                                  @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return suppliers.setActive(id, value, actor, clientIp(request));
    }

    /** FR-SUP-07. */
    @GetMapping("/suppliers/{id}/receipts")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public List<GoodsReceiptView> history(@PathVariable UUID id) {
        return receipts.forSupplier(id);
    }

    /** FR-SUP-07: delivery history for one product, including supplier and outlet. */
    @GetMapping("/products/{productId}/purchase-history")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public List<GoodsReceiptView> productHistory(@PathVariable UUID productId) {
        return receipts.forProduct(productId);
    }

    @GetMapping("/goods-receipts")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public List<GoodsReceiptView> atOutlet(@RequestParam UUID outletId) {
        outletAccess.assertVisible(outletId);
        return receipts.atOutlet(outletId);
    }

    /** FR-SUP-04: writes the movements and moves weighted average cost. */
    @PostMapping("/goods-receipts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_RECEIVE + "')")
    public GoodsReceiptView receive(@Valid @RequestBody GoodsReceiptRequest body,
                                    @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return receipts.receive(body, actor, clientIp(request));
    }

    /** FR-SUP-06. */
    @PostMapping("/goods-receipts/{id}/reverse")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_RECEIVE + "')")
    public GoodsReceiptView reverse(@PathVariable UUID id,
                                    @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return receipts.reverse(id, actor, clientIp(request));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
