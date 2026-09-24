package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.CustomerRequest;
import gh.giftedlabs.pos.dto.CustomerView;
import gh.giftedlabs.pos.dto.SaleView;
import gh.giftedlabs.pos.entity.Customer;
import gh.giftedlabs.pos.entity.Sale;
import gh.giftedlabs.pos.exception.CustomerPhoneTakenException;
import gh.giftedlabs.pos.repository.CustomerRepository;
import gh.giftedlabs.pos.rules.CustomerType;
import gh.giftedlabs.pos.rules.PhoneKey;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.CustomerService;
import gh.giftedlabs.pos.service.SaleService;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.*;

/**
 * Customers — FR-CUST.
 *
 * <p>What a customer has spent is never stored. It is worked out from their
 * sales each time they are shown, because a running total is a second copy of
 * what the sales already say and after one void only one of them can be right.
 */
@Service
public class CustomerServiceImpl implements CustomerService {

    private final CustomerRepository customers;
    private final SaleService sales;
    private final AuditService audit;
    private final Clock clock;

    public CustomerServiceImpl(CustomerRepository customers, SaleService sales,
                               AuditService audit, Clock clock) {
        this.customers = customers;
        this.sales = sales;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CustomerView> search(String query, boolean includeInactive, int limit) {
        String term = query == null ? "" : query.trim();
        List<Customer> found = customers.search(term, phoneTermOf(term),
                includeInactive, PageRequest.of(0, limit));
        return withTotals(found);
    }

    @Override
    @Transactional(readOnly = true)
    public CustomerView get(UUID id) {
        return withTotals(List.of(find(id))).getFirst();
    }

    /** FR-CUST-03. */
    @Override
    @Transactional(readOnly = true)
    public Optional<CustomerView> byPhone(String phone) {
        String key = PhoneKey.of(phone);
        if (key.isEmpty()) return Optional.empty();
        return customers.findByPhoneKey(key).map(customer -> withTotals(List.of(customer)).getFirst());
    }

    /** FR-CUST-02 · FR-CUST-03. */
    @Override
    @Transactional
    public CustomerView create(CustomerRequest request, PosPrincipal actor, String clientIp) {
        String phone = request.phone().trim();
        requireUsablePhone(phone);
        refuseDuplicatePhone(phone, null);

        CustomerType type = CustomerType.fromKey(request.type());
        Customer customer = new Customer(request.name().trim(), phone, type, actor.userId(), clock.instant());
        applyDetails(request, type, customer);

        Customer saved = customers.save(customer);
        audit.record(actor.userId(), "CUSTOMER_CREATED", "customer", saved.getId(), null,
                snapshot(saved), actor.outletId(), null, clientIp);

        return CustomerView.of(saved, 0L, 0L);
    }

    @Override
    @Transactional
    public CustomerView update(UUID id, CustomerRequest request, PosPrincipal actor, String clientIp) {
        Customer customer = find(id);
        Map<String, Object> before = snapshot(customer);

        String phone = request.phone().trim();
        requireUsablePhone(phone);
        refuseDuplicatePhone(phone, id);

        CustomerType type = CustomerType.fromKey(request.type());
        customer.setName(request.name().trim());
        customer.setPhone(phone);
        customer.setType(type);
        applyDetails(request, type, customer);
        customer.touch(clock.instant());

        audit.record(actor.userId(), "CUSTOMER_UPDATED", "customer", id, before,
                snapshot(customer), actor.outletId(), null, clientIp);

        return withTotals(List.of(customer)).getFirst();
    }

    /** BR-17. */
    @Override
    @Transactional
    public CustomerView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp) {
        Customer customer = find(id);
        if (active) customer.activate(); else customer.deactivate();
        customer.touch(clock.instant());

        audit.record(actor.userId(), active ? "CUSTOMER_REACTIVATED" : "CUSTOMER_DEACTIVATED",
                "customer", id, null, Map.of("name", customer.getName(), "phone", customer.getPhone()),
                actor.outletId(), null, clientIp);

        return withTotals(List.of(customer)).getFirst();
    }

    /** FR-CUST-06 · FR-CUST-05: every branch, not the one they are standing in. */
    @Override
    @Transactional(readOnly = true)
    public List<SaleView> history(UUID id, int limit) {
        find(id);
        return sales.forCustomer(id, limit);
    }

    // --- internals ---------------------------------------------------------

    /**
     * The phone half of the search, and only when the query is a number.
     *
     * <p>Matched against the normalised key, so typing the number the way it is
     * printed on a card finds it however it was saved.
     *
     * <p>A query with letters in it is a name, even when it has digits too.
     * Pulling the digits out of "Unit 3 Osei" and matching them against phone
     * keys returns whoever happens to have a 3 in their number, which reads on
     * screen as the search being broken.
     */
    private String phoneTermOf(String term) {
        if (term.isEmpty() || term.chars().anyMatch(Character::isLetter)) return term;

        String key = PhoneKey.of(term);
        // Two digits would match most of the list. Below three, search by name.
        return key.length() >= 3 ? key : term;
    }

    private Customer find(UUID id) {
        return customers.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such customer"));
    }

    /**
     * FR-CUST-03: a number they can be found by, or no customer.
     *
     * <p>Checked before the uniqueness test, because two customers saved with
     * unusable numbers would collide on an empty key and the second would be
     * told the first is "already a customer".
     */
    private void requireUsablePhone(String phone) {
        if (!PhoneKey.isUsable(phone)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That phone number is too short to find anyone by");
        }
    }

    /**
     * FR-CUST-03: one number, one customer.
     *
     * <p>The existing record travels with the refusal so the counter can be
     * offered it. "That number is taken" with nothing to click is how a second
     * record gets created with a digit changed.
     */
    private void refuseDuplicatePhone(String phone, UUID selfId) {
        String key = PhoneKey.of(phone);
        if (!customers.phoneTaken(key, selfId)) return;

        Customer existing = customers.findByPhoneKey(key).orElseThrow();
        throw new CustomerPhoneTakenException(phone, existing.getId(), existing.getName());
    }

    /**
     * FR-PRICE-05: a rate that was not sent means the type's, not zero.
     *
     * <p>A contractor saved from a form with no discount field should keep the
     * contractor rate. Only an explicit zero takes it away.
     */
    private void applyDetails(CustomerRequest request, CustomerType type, Customer customer) {
        customer.setEmail(blankToNull(request.email()));
        customer.setAddress(blankToNull(request.address()));
        customer.setNotes(blankToNull(request.notes()));
        customer.setDiscountRate(request.discountRate() == null
                ? type.defaultDiscountRate()
                : request.discountRate());
        // FR-CUST-07: null leaves the limit alone. A screen that does not offer
        // the field must not be able to withdraw somebody's credit by saving
        // their phone number.
        if (request.creditLimit() != null) customer.setCreditLimit(request.creditLimit());
    }

    /** FR-CUST-06: totals for the whole page in one query, not one per row. */
    private List<CustomerView> withTotals(List<Customer> found) {
        if (found.isEmpty()) return List.of();

        Map<UUID, long[]> totals = new HashMap<>();
        List<UUID> ids = found.stream().map(Customer::getId).toList();
        for (Object[] row : customers.purchaseTotals(ids, Sale.Status.COMPLETED)) {
            totals.put((UUID) row[0], new long[] { ((Number) row[1]).longValue(),
                                                   ((Number) row[2]).longValue() });
        }

        return found.stream()
                .map(customer -> {
                    long[] spent = totals.getOrDefault(customer.getId(), new long[] { 0L, 0L });
                    return CustomerView.of(customer, spent[0], spent[1]);
                })
                .toList();
    }

    private Map<String, Object> snapshot(Customer customer) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("name", customer.getName());
        state.put("phone", customer.getPhone());
        state.put("email", customer.getEmail());
        state.put("address", customer.getAddress());
        state.put("type", customer.getType().key());
        state.put("discountRate", customer.getDiscountRate());
        state.put("active", customer.isActive());
        return state;
    }

    private String blankToNull(String value) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.isEmpty() ? null : clean;
    }
}
