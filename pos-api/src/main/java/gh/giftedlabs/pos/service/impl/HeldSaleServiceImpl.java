package gh.giftedlabs.pos.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.dto.HeldSaleRequest;
import gh.giftedlabs.pos.dto.HeldSaleView;
import gh.giftedlabs.pos.entity.HeldSale;
import gh.giftedlabs.pos.repository.HeldSaleRepository;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.HeldSaleService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class HeldSaleServiceImpl implements HeldSaleService {
    private final HeldSaleRepository heldSales;
    private final ObjectMapper json;
    private final AuditService audit;

    public HeldSaleServiceImpl(HeldSaleRepository heldSales, ObjectMapper json, AuditService audit) {
        this.heldSales = heldSales;
        this.json = json;
        this.audit = audit;
    }

    @Override
    @Transactional(readOnly = true)
    public List<HeldSaleView> atOutlet(UUID outletId, PosPrincipal actor) {
        requireOutlet(actor, outletId);
        return heldSales.findAllByOutletIdOrderByHeldAtDesc(outletId).stream().map(this::view).toList();
    }

    @Override
    @Transactional
    public HeldSaleView hold(HeldSaleRequest request, PosPrincipal actor, String clientIp) {
        requireOutlet(actor, request.outletId());
        String label = request.label() == null || request.label().isBlank()
                ? "Held sale" : request.label().trim();
        try {
            HeldSale saved = heldSales.save(new HeldSale(request.outletId(), request.terminalId(), actor.userId(),
                    label, request.customerId(), request.customerName(), request.customerPhone(),
                    request.total(), json.writeValueAsString(request.lines())));
            audit.record(actor.userId(), "SALE_HELD", "held_sale", saved.getId(), null,
                    Map.of("label", label, "lines", request.lines().size(), "total", request.total()),
                    request.outletId(), request.terminalId(), clientIp);
            return view(saved);
        } catch (JsonProcessingException failure) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not save held sale", failure);
        }
    }

    @Override
    @Transactional
    public void delete(UUID id, PosPrincipal actor, String clientIp) {
        HeldSale held = heldSales.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such held sale"));
        requireOutlet(actor, held.getOutletId());
        heldSales.delete(held);
        audit.record(actor.userId(), "SALE_HELD_DELETED", "held_sale", id,
                Map.of("label", held.getLabel(), "total", held.getTotal()), null,
                held.getOutletId(), held.getTerminalId(), clientIp);
    }

    private void requireOutlet(PosPrincipal actor, UUID outletId) {
        if (actor.outletId() != null && !actor.outletId().equals(outletId)) {
            throw new AccessDeniedException("Held sales are limited to the signed-in outlet");
        }
    }

    private HeldSaleView view(HeldSale held) {
        try {
            return new HeldSaleView(held.getId(), held.getOutletId(), held.getTerminalId(), held.getCashierId(),
                    held.getLabel(), held.getCustomerId(), held.getCustomerName(), held.getCustomerPhone(),
                    held.getTotal(), held.getHeldAt(), json.readValue(held.getCartJson(), new TypeReference<>() { }));
        } catch (JsonProcessingException failure) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Held sale data is invalid", failure);
        }
    }
}
