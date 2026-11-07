package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.security.OutletAccessGuard;

import gh.giftedlabs.pos.dto.InstallmentPaymentRequest;
import gh.giftedlabs.pos.dto.InstallmentPlanRequest;
import gh.giftedlabs.pos.dto.InstallmentPlanView;
import gh.giftedlabs.pos.dto.ReceiptView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.ReceiptWidth;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.InstallmentService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;
import org.springframework.web.server.ResponseStatusException;

/**
 * Customer installment plans — {@code customer.credit}.
 *
 * <p>One code across the whole controller, unlike expenses. Selling on credit and
 * collecting on it are the same job: whoever agrees a plan is the person taking
 * the money against it, and splitting the two would mean a counter that could
 * create a debt and not receipt a payment on it.
 *
 * <p>{@code customer.credit} existed in the catalogue from the start with nothing
 * behind it. It now authorises these routes, which is what stopped it being a
 * future-stage placeholder.
 */
@RestController
@RequestMapping("/api/installment-plans")
public class InstallmentController {

    private final InstallmentService installments;

    private final OutletAccessGuard outletAccess;

    public InstallmentController(InstallmentService installments, OutletAccessGuard outletAccess) {
        this.installments = installments;
        this.outletAccess = outletAccess;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_CREDIT + "')")
    public InstallmentPlanView.Page list(@RequestParam(required = false) UUID outletId,
                                         @RequestParam(required = false) UUID customerId) {
        outletId = outletAccess.scope(outletId);
        return installments.list(outletId, customerId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_CREDIT + "')")
    public InstallmentPlanView get(@PathVariable UUID id) {
        return installments.get(id);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_CREDIT + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public InstallmentPlanView create(@Valid @RequestBody InstallmentPlanRequest body,
                                      @AuthenticationPrincipal PosPrincipal actor,
                                      HttpServletRequest request) {
        return installments.create(body, actor, clientIp(request));
    }

    /** Applied to the oldest unpaid installment first; spills forward. */
    @PostMapping("/{id}/payments")
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_CREDIT + "')")
    public InstallmentPlanView pay(@PathVariable UUID id,
                                   @Valid @RequestBody InstallmentPaymentRequest body,
                                   @AuthenticationPrincipal PosPrincipal actor,
                                   HttpServletRequest request) {
        return installments.recordPayment(id, body, actor, clientIp(request));
    }

    @GetMapping("/{id}/payments/{paymentId}/receipt")
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_CREDIT + "')")
    public ReceiptView paymentReceipt(@PathVariable UUID id, @PathVariable UUID paymentId,
                                      @RequestParam(defaultValue = "80mm") String width,
                                      @AuthenticationPrincipal PosPrincipal actor,
                                      HttpServletRequest request) {
        return installments.paymentReceipt(id, paymentId, width(width), false, actor, clientIp(request));
    }

    /** A second copy is visibly marked and audited before its bytes are returned. */
    @PostMapping("/{id}/payments/{paymentId}/receipt/reprint")
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_CREDIT + "')")
    public ReceiptView reprintPaymentReceipt(@PathVariable UUID id, @PathVariable UUID paymentId,
                                             @RequestParam(defaultValue = "80mm") String width,
                                             @AuthenticationPrincipal PosPrincipal actor,
                                             HttpServletRequest request) {
        return installments.paymentReceipt(id, paymentId, width(width), true, actor, clientIp(request));
    }

    /**
     * Write a plan off, or bring it back.
     *
     * <p>Writing off a debt is not the same authority as agreeing one — it is the
     * owner deciding money will not be collected — so this route alone asks for
     * {@code settings.general} on top.
     */
    @PostMapping("/{id}/default")
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_CREDIT + "') and "
            + "hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public InstallmentPlanView setDefaulted(@PathVariable UUID id,
                                            @RequestParam(defaultValue = "true") boolean defaulted,
                                            @RequestParam(required = false) String reason,
                                            @AuthenticationPrincipal PosPrincipal actor,
                                            HttpServletRequest request) {
        return installments.setDefaulted(id, defaulted, reason, actor, clientIp(request));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }

    private ReceiptWidth width(String label) {
        return ReceiptWidth.ofLabel(label).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Paper width is 80mm or 58mm"));
    }
}
