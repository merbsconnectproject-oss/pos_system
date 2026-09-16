package gh.giftedlabs.pos.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Taking goods back against a receipt.
 *
 * <p>No prices. The refund is computed from the original sale line, not from
 * anything the client sends — a request that could name its own refund amount is
 * a request that can be edited in the browser, and the whole point of tying a
 * return to a receipt is that the shop knows what was paid.
 */
public record ReturnRequest(

        @NotNull(message = "A return is processed against the original sale")
        UUID originalSaleId,

        @NotBlank @Pattern(regexp = "REFUND|EXCHANGE", message = "Choose a refund or an exchange")
        String kind,

        @NotEmpty(message = "Choose at least one item to return")
        @Valid List<Line> items,

        /**
         * How the money goes back. Null for an even exchange, where none does.
         *
         * <p>CASH also writes a cash movement, so the drawer still reconciles at
         * close (BR-13, BR-14). A refund that left the till without one would
         * show up as a shortage and a cashier would be asked to explain it.
         */
        @Pattern(regexp = "CASH|CARD|MOBILE_MONEY|BANK_TRANSFER|EXCHANGE_CREDIT",
                message = "Choose how the refund was given")
        String refundMethod,

        /** EXCHANGE only: the replacement goods, sold as an ordinary sale. */
        @Valid SaleRequest exchangeSale,

        /**
         * FR-USER-03: who authorised it, when the cashier may not refund alone.
         *
         * <p>Verified against {@code sale.refund} server-side. An id in a request
         * body is the client's claim, not an authorisation.
         */
        UUID approvedBy,

        @Size(max = 1000) String notes) {

    /**
     * One line coming back.
     *
     * @param saleItemId  the line it was sold on — the cap on quantity and the
     *                    source of both the price paid and the frozen cost
     * @param quantityBase how much, in base units. May be part of a line: half a
     *                     drum of cable can come back
     */
    public record Line(
            @NotNull(message = "Name the line being returned") UUID saleItemId,

            @NotNull @DecimalMin(value = "0.001", message = "Enter a quantity greater than zero")
            BigDecimal quantityBase,

            @NotBlank(message = "Every returned item needs a reason")
            @Size(max = 60) String reason,

            @NotBlank @Pattern(regexp = "RESTOCK|DAMAGED_WRITE_OFF|SUPPLIER_RMA",
                    message = "Say whether it goes back on the shelf, is written off, or goes to the supplier")
            String disposition,

            @Size(max = 500) String conditionNotes) {
    }
}
