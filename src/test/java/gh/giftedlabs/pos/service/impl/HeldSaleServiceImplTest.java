package gh.giftedlabs.pos.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.dto.HeldSaleRequest;
import gh.giftedlabs.pos.entity.HeldSale;
import gh.giftedlabs.pos.repository.HeldSaleRepository;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@DisplayName("Held sales — FR-POS-14")
class HeldSaleServiceImplTest {
    @Nested
    @DisplayName("FR-POS-14 · held carts are persisted for later resumption")
    class Persistence {
        @Test
        void savesCartAndRecordsAudit() {
            HeldSaleRepository repository = mock(HeldSaleRepository.class);
            AuditService audit = mock(AuditService.class);
            HeldSaleServiceImpl service = new HeldSaleServiceImpl(repository, new ObjectMapper(), audit);
            UUID outletId = UUID.randomUUID();
            UUID cashierId = UUID.randomUUID();
            UUID productId = UUID.randomUUID();
            UUID heldId = UUID.randomUUID();
            PosPrincipal actor = new PosPrincipal(cashierId, "cashier", outletId, Instant.now());
            HeldSaleRequest request = new HeldSaleRequest(outletId, null, "Customer pickup", null,
                    "Ama", "0240000000", 1250,
                    List.of(new HeldSaleRequest.Line(productId, "Cable", "CBL-1", "piece",
                            BigDecimal.ONE, BigDecimal.ONE, new BigDecimal("12.50"), BigDecimal.ZERO,
                            new BigDecimal("12.50"), new BigDecimal("8.00"))));
            HeldSale persisted = new HeldSale(outletId, null, cashierId, "Customer pickup", null,
                    "Ama", "0240000000", 1250,
                    "[{\"productId\":\"" + productId + "\",\"productName\":\"Cable\",\"sku\":\"CBL-1\",\"selectedUnit\":\"piece\",\"conversionFactor\":1,\"quantity\":1,\"unitPrice\":12.50,\"discount\":0,\"lineTotal\":12.50,\"frozenCostPrice\":8.00}]");
            ReflectionTestUtils.setField(persisted, "id", heldId);
            when(repository.save(any(HeldSale.class))).thenReturn(persisted);

            var result = service.hold(request, actor, "127.0.0.1");

            assertEquals(heldId, result.id());
            assertEquals(1250, result.total());
            assertEquals(1, result.lines().size());
            verify(repository).save(any(HeldSale.class));
            verify(audit).record(eq(cashierId), eq("SALE_HELD"), eq("held_sale"), eq(heldId),
                    isNull(), any(), eq(outletId), isNull(), eq("127.0.0.1"));
        }
    }
}
