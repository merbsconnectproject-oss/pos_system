package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.CustomerRequest;
import gh.giftedlabs.pos.dto.CustomerView;
import gh.giftedlabs.pos.dto.SaleView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Customers — FR-CUST. One list for the whole business (FR-CUST-05). */
public interface CustomerService {

    List<CustomerView> search(String query, boolean includeInactive, int limit);

    CustomerView get(UUID id);

    /**
     * FR-CUST-03: the counter's lookup — a number, and nothing else.
     *
     * <p>Matched on the normalised key, so the number found is the same
     * customer however either party spelled it.
     */
    Optional<CustomerView> byPhone(String phone);

    CustomerView create(CustomerRequest request, PosPrincipal actor, String clientIp);

    CustomerView update(UUID id, CustomerRequest request, PosPrincipal actor, String clientIp);

    /** BR-17: deactivated, never deleted — they are on receipts already printed. */
    CustomerView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp);

    /** FR-CUST-06 · `G-05`: their purchases, across every branch. */
    List<SaleView> history(UUID id, int limit);
}
