package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.Supplier;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A supplier as the directory shows it — FR-SUP-01, FR-SUP-07.
 *
 * <p>{@code totalSupplied} is summed from confirmed receipts rather than kept
 * on the row. A stored total is a second record of what the receipts already
 * say, and the two drift the first time one is reversed.
 */
public record SupplierView(
        UUID id,
        String name,
        String contactPerson,
        String phone,
        String email,
        String address,
        String paymentTerms,
        String notes,
        String categorySupplied,
        UUID outletId,
        boolean active,
        BigDecimal totalSupplied,
        Instant createdAt) {

    public static SupplierView of(Supplier supplier, BigDecimal totalSupplied) {
        return new SupplierView(supplier.getId(), supplier.getName(), supplier.getContactPerson(),
                supplier.getPhone(), supplier.getEmail(), supplier.getAddress(),
                supplier.getPaymentTerms(), supplier.getNotes(), supplier.getCategorySupplied(),
                supplier.getOutletId(), supplier.isActive(), totalSupplied, supplier.getCreatedAt());
    }
}
