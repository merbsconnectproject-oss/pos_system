package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.Outlet;

import java.time.Instant;
import java.util.UUID;

/**
 * An outlet as the frontend's {@code types.ts} Outlet expects it — FR-OUT-02.
 *
 * <p>{@code code} is the field the client calls {@code receiptPrefix}: BR-6's
 * {@code {OUTLET}} segment, and the value it joins its local outlet list on.
 */
public record OutletView(
        UUID id,
        String code,
        String name,
        String tradingName,
        String town,
        String address,
        String phone,
        String managerName,
        String receiptFooter,
        String logoUrl,
        java.math.BigDecimal defaultReorderLevel,
        boolean active,
        Instant createdAt) {

    public static OutletView of(Outlet outlet) {
        return new OutletView(
                outlet.getId(),
                outlet.getCode(),
                outlet.getName(),
                outlet.getTradingName(),
                outlet.getTown(),
                outlet.getAddress(),
                outlet.getPhone(),
                outlet.getManagerName(),
                outlet.getReceiptFooter(),
                outlet.getLogoUrl(),
                outlet.getDefaultReorderLevel(),
                outlet.isActive(),
                outlet.getCreatedAt());
    }
}
