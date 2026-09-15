package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record HeldSaleView(
        UUID id,
        UUID outletId,
        UUID terminalId,
        UUID cashierId,
        String label,
        UUID customerId,
        String customerName,
        String customerPhone,
        long total,
        Instant heldAt,
        List<HeldSaleRequest.Line> lines) { }
