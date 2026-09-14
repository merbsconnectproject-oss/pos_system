package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.SupplierRequest;
import gh.giftedlabs.pos.dto.SupplierView;
import gh.giftedlabs.pos.entity.Supplier;
import gh.giftedlabs.pos.exception.CatalogueListException;
import gh.giftedlabs.pos.repository.GoodsReceiptRepository;
import gh.giftedlabs.pos.repository.SupplierRepository;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.SupplierService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** FR-SUP-01. */
@Service
public class SupplierServiceImpl implements SupplierService {

    private final SupplierRepository suppliers;
    private final GoodsReceiptRepository receipts;
    private final AuditService audit;

    public SupplierServiceImpl(SupplierRepository suppliers, GoodsReceiptRepository receipts, AuditService audit) {
        this.suppliers = suppliers;
        this.receipts = receipts;
        this.audit = audit;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SupplierView> list(boolean includeInactive) {
        List<Supplier> found = includeInactive
                ? suppliers.findAllByOrderByNameAsc()
                : suppliers.findAllByActiveTrueOrderByNameAsc();
        return found.stream().map(this::view).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public SupplierView get(UUID id) {
        return view(suppliers.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such supplier")));
    }

    @Override
    @Transactional
    public SupplierView create(SupplierRequest request, PosPrincipal actor, String clientIp) {
        String name = request.name().trim();
        if (suppliers.nameTaken(name, null)) throw CatalogueListException.duplicate("supplier", name);

        Supplier supplier = new Supplier(name);
        apply(request, supplier);
        Supplier saved = suppliers.save(supplier);

        audit.record(actor.userId(), "SUPPLIER_CREATED", "supplier", saved.getId(),
                null, snapshot(saved), actor.outletId(), null, clientIp);
        return view(saved);
    }

    @Override
    @Transactional
    public SupplierView update(UUID id, SupplierRequest request, PosPrincipal actor, String clientIp) {
        Supplier supplier = suppliers.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such supplier"));
        Map<String, Object> before = snapshot(supplier);

        String name = request.name().trim();
        if (suppliers.nameTaken(name, id)) throw CatalogueListException.duplicate("supplier", name);

        supplier.setName(name);
        apply(request, supplier);

        audit.record(actor.userId(), "SUPPLIER_UPDATED", "supplier", id,
                before, snapshot(supplier), actor.outletId(), null, clientIp);
        return view(supplier);
    }

    @Override
    @Transactional
    public SupplierView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp) {
        Supplier supplier = suppliers.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such supplier"));

        if (active) supplier.activate(); else supplier.deactivate();

        audit.record(actor.userId(), active ? "SUPPLIER_RESTORED" : "SUPPLIER_RETIRED", "supplier", id,
                null, Map.of("name", supplier.getName()), actor.outletId(), null, clientIp);
        return view(supplier);
    }

    private void apply(SupplierRequest request, Supplier supplier) {
        supplier.setContactPerson(trimmed(request.contactPerson()));
        supplier.setPhone(trimmed(request.phone()));
        supplier.setEmail(trimmed(request.email()));
        supplier.setAddress(trimmed(request.address()));
        supplier.setPaymentTerms(trimmed(request.paymentTerms()));
        supplier.setNotes(trimmed(request.notes()));
        supplier.setCategorySupplied(trimmed(request.categorySupplied()));
        supplier.setOutletId(request.outletId());
    }

    private SupplierView view(Supplier supplier) {
        return SupplierView.of(supplier, receipts.totalSuppliedBy(supplier.getId()));
    }

    private Map<String, Object> snapshot(Supplier supplier) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("name", supplier.getName());
        state.put("contactPerson", supplier.getContactPerson());
        state.put("phone", supplier.getPhone());
        state.put("email", supplier.getEmail());
        state.put("paymentTerms", supplier.getPaymentTerms());
        state.put("active", supplier.isActive());
        return state;
    }

    private String trimmed(String value) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.isEmpty() ? null : clean;
    }
}
