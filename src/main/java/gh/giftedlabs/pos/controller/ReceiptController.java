package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.ReceiptView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.ReceiptWidth;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.ReceiptService;
import gh.giftedlabs.pos.service.SaleService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Receipts — FR-RCPT.
 *
 * <p>The rendering is the server's, so a reprint is byte-identical to the
 * original and a preview cannot drift from what the printer produces.
 */
@RestController
@RequestMapping("/api/receipts")
public class ReceiptController {

    private final ReceiptService receipts;
    private final SaleService sales;

    public ReceiptController(ReceiptService receipts, SaleService sales) {
        this.receipts = receipts;
        this.sales = sales;
    }

    /**
     * The receipt for a sale.
     *
     * <p>Only {@code isAuthenticated()}: the cashier who just rang the sale must
     * be able to print it, and they hold nothing else. Reprinting later is the
     * restricted action, and it has its own route below.
     */
    @GetMapping("/sale/{saleId}")
    @PreAuthorize("isAuthenticated()")
    public ReceiptView forSale(@PathVariable UUID saleId,
                               @RequestParam(defaultValue = "80mm") String width) {
        return receipts.render(saleId, width(width), false);
    }

    /**
     * FR-RCPT-06: a second copy, marked and logged.
     *
     * <p>A POST rather than a GET with a flag, because it records something. The
     * audit entry is the point — a reprinted receipt is a second piece of paper
     * for one sale, and somebody may later need to account for it.
     */
    @PostMapping("/sale/{saleId}/reprint")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_REPRINT + "')")
    public ReceiptView reprint(@PathVariable UUID saleId,
                               @RequestParam(defaultValue = "80mm") String width,
                               @AuthenticationPrincipal PosPrincipal actor,
                               HttpServletRequest request) {
        // Logged first. If the audit write fails the reprint does not happen,
        // which is the right way round for a document that must be accounted for.
        sales.reprint(saleId, actor, clientIp(request));
        return receipts.render(saleId, width(width), true);
    }

    /**
     * The credit note for a return or swap.
     *
     * <p>{@code sale.refund} rather than {@code isAuthenticated()}: a credit note
     * says what the shop paid back and why, which is the same disclosure as the
     * return itself.
     */
    @GetMapping("/return/{returnId}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_REFUND + "')")
    public ReceiptView forReturn(@PathVariable UUID returnId,
                                 @RequestParam(defaultValue = "80mm") String width,
                                 @RequestParam(defaultValue = "false") boolean reprint) {
        return receipts.renderReturn(returnId, width(width), reprint);
    }

    /** FR-RCPT-09 · `K-05`: what each roll looks like, before anything is sold. */
    @GetMapping("/preview")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_TERMINAL + "')")
    public ReceiptView preview(@RequestParam(defaultValue = "80mm") String width,
                               @AuthenticationPrincipal PosPrincipal actor) {
        return receipts.preview(width(width), actor);
    }

    private ReceiptWidth width(String label) {
        return ReceiptWidth.ofLabel(label).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Paper width is 80mm or 58mm"));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
