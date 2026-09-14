package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.CustomerRequest;
import gh.giftedlabs.pos.dto.CustomerView;
import gh.giftedlabs.pos.dto.SaleView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.CustomerService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Customers — FR-CUST.
 *
 * <p>Reading needs only a signed-in user; writing needs {@code customer.manage}.
 * A storekeeper checking who a delivery is for should not have to be able to
 * edit them, and a cashier who can attach a customer to a sale can create one
 * at the counter — which is when customers are actually created.
 */
@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerService customers;

    public CustomerController(CustomerService customers) {
        this.customers = customers;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<CustomerView> search(@RequestParam(required = false) String query,
                                     @RequestParam(defaultValue = "false") boolean includeInactive,
                                     @RequestParam(defaultValue = "200") int limit) {
        return customers.search(query, includeInactive, Math.clamp(limit, 1, 500));
    }

    /**
     * FR-CUST-03: the counter's lookup.
     *
     * <p>204 rather than 404 when nobody matches. Not finding a customer is an
     * ordinary answer at a till — most sales have none — and a 404 in the
     * console on every walk-in sale trains people to ignore 404s.
     */
    @GetMapping("/by-phone")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CustomerView> byPhone(@RequestParam String phone) {
        return customers.byPhone(phone).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public CustomerView get(@PathVariable UUID id) {
        return customers.get(id);
    }

    /** FR-CUST-06 · FR-CUST-05 · `G-05`: across every branch. */
    @GetMapping("/{id}/sales")
    @PreAuthorize("isAuthenticated()")
    public List<SaleView> history(@PathVariable UUID id,
                                  @RequestParam(defaultValue = "50") int limit) {
        return customers.history(id, Math.clamp(limit, 1, 200));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_MANAGE + "')")
    public CustomerView create(@Valid @RequestBody CustomerRequest body,
                               @AuthenticationPrincipal PosPrincipal actor,
                               HttpServletRequest request) {
        return customers.create(body, actor, clientIp(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_MANAGE + "')")
    public CustomerView update(@PathVariable UUID id, @Valid @RequestBody CustomerRequest body,
                               @AuthenticationPrincipal PosPrincipal actor,
                               HttpServletRequest request) {
        return customers.update(id, body, actor, clientIp(request));
    }

    /** BR-17: deactivated, never deleted. */
    @PostMapping("/{id}/active")
    @PreAuthorize("hasAuthority('" + Permission.Codes.CUSTOMER_MANAGE + "')")
    public CustomerView setActive(@PathVariable UUID id, @RequestParam("value") boolean value,
                                  @AuthenticationPrincipal PosPrincipal actor,
                                  HttpServletRequest request) {
        return customers.setActive(id, value, actor, clientIp(request));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
