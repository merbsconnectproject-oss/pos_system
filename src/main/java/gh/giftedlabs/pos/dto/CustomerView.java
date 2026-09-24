package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.Customer;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A customer as the frontend's {@code types.ts} Customer expects them.
 *
 * <p>{@code totalPurchased} and {@code salesCount} are computed from the sales
 * every time rather than stored, so they cannot drift from the sales they
 * describe — and they are in major units because that is what the field on the
 * screen is.
 */
public record CustomerView(
        UUID id,
        String name,
        String phone,
        String email,
        String address,
        String customerType,
        /** FR-CUST-04: which of the product's prices applies to them. */
        String priceLevel,
        BigDecimal discountRate,
        /** FR-CUST-07: the most they may owe. Zero means no credit. */
        BigDecimal creditLimit,
        String notes,
        boolean active,
        BigDecimal totalPurchased,
        long salesCount,
        Instant createdAt) {

    public static CustomerView of(Customer customer, long totalPesewas, long salesCount) {
        return new CustomerView(
                customer.getId(),
                customer.getName(),
                customer.getPhone(),
                customer.getEmail(),
                customer.getAddress(),
                customer.getType().key(),
                customer.getType().priceLevel().name(),
                customer.getDiscountRate(),
                customer.getCreditLimit(),
                customer.getNotes(),
                customer.isActive(),
                BigDecimal.valueOf(totalPesewas).movePointLeft(2),
                salesCount,
                customer.getCreatedAt());
    }
}
