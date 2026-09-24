package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.dto.CustomerStatement;
import gh.giftedlabs.pos.dto.InstallmentPlanRequest;
import gh.giftedlabs.pos.entity.Customer;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.CustomerRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.CustomerType;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * FR-CUST-07: credit limits, balances and ageing.
 *
 * <p>The checklist recorded this as the gap it was: "part payments are built —
 * installment plans with schedules and receipts. Credit limits, running
 * balances, ageing and statements are not: {@code credit_limit} appears nowhere
 * in the server." Credit could therefore be extended without any ceiling at
 * all, which makes it a hope rather than a policy.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DisplayName("Customer credit — FR-CUST-07")
class CustomerCreditTest {

    @Autowired CustomerCreditService credit;
    @Autowired InstallmentService installments;
    @Autowired CustomerRepository customers;
    @Autowired OutletRepository outlets;
    @Autowired UserRepository users;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private UUID outletId;
    private PosPrincipal actor;
    private String run;

    @BeforeEach
    void setUp() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();

        Outlet outlet = new Outlet("CR" + run.substring(0, 3), "Credit Branch " + run);
        outletId = outlets.save(outlet).getId();

        User owner = new User("credit-owner-" + run.toLowerCase(), "Credit Owner",
                passwords.encode("Str0ng!Passw0rd"));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        UUID ownerId = users.save(owner).getId();

        actor = new PosPrincipal(ownerId, owner.getUsername(), outletId, java.time.Instant.now());
    }

    @Test
    @DisplayName("a customer with no limit set is not held to one")
    void noLimitMeansUnenforced() {
        UUID customerId = customer("No Limit " + run, BigDecimal.ZERO);

        // Zero means "no limit set", not "no credit". The column defaults to
        // zero, so the opposite reading would have the upgrade that introduced
        // limits deny credit to every customer a shop already serves — nine
        // existing installment tests failed on exactly that, which is the
        // clearest possible statement of what it would do to a real shop.
        assertDoesNotThrow(() -> credit.requireWithinLimit(customerId, 50_00));
    }

    @Test
    @DisplayName("a plan within the limit goes through")
    void withinTheLimitIsAllowed() {
        UUID customerId = customer("Within " + run, new BigDecimal("1000.00"));
        assertDoesNotThrow(() -> credit.requireWithinLimit(customerId, 400_00));
    }

    @Test
    @DisplayName("a plan past the limit is refused, and the message says by how much")
    void pastTheLimitIsRefused() {
        UUID customerId = customer("Past " + run, new BigDecimal("100.00"));

        ResponseStatusException refused = assertThrows(ResponseStatusException.class,
                () -> credit.requireWithinLimit(customerId, 250_00));
        assertTrue(refused.getReason().contains("250.00"), refused.getReason());
        assertTrue(refused.getReason().contains("100.00"), refused.getReason());
    }

    @Test
    @DisplayName("the balance counts what is already owed — FR-CUST-07")
    void existingPlansCountAgainstTheLimit() {
        UUID customerId = customer("Running " + run, new BigDecimal("500.00"));

        // GH₵400 on credit, GH₵100 of it paid down: GH₵300 owed.
        installments.create(new InstallmentPlanRequest(
                customerId, outletId, null, 400_00L, 100_00L, "monthly", 3,
                LocalDate.now(), null, List.of()), actor, "127.0.0.1");

        CustomerStatement statement = credit.statement(customerId);
        assertEquals(0, statement.balance().compareTo(new BigDecimal("300.00")),
                "balance was " + statement.balance());
        assertEquals(0, statement.available().compareTo(new BigDecimal("200.00")),
                "available was " + statement.available());

        // A second plan for GH₵250 would take them to GH₵550 against GH₵500.
        assertThrows(ResponseStatusException.class,
                () -> credit.requireWithinLimit(customerId, 250_00));
        // GH₵150 fits.
        assertDoesNotThrow(() -> credit.requireWithinLimit(customerId, 150_00));
    }

    @Test
    @DisplayName("a plan not yet due sits in current, not in arrears")
    void futureDuesAreCurrent() {
        UUID customerId = customer("Current " + run, new BigDecimal("1000.00"));

        installments.create(new InstallmentPlanRequest(
                customerId, outletId, null, 300_00L, 0L, "monthly", 3,
                LocalDate.now().plusDays(7), null, List.of()), actor, "127.0.0.1");

        CustomerStatement statement = credit.statement(customerId);
        assertEquals(0, statement.ageing().current().compareTo(new BigDecimal("300.00")),
                "nothing is late yet: " + statement.ageing());
        assertEquals(0, statement.ageing().over60Days().compareTo(BigDecimal.ZERO));
    }

    @Test
    @DisplayName("a plan overdue by months lands in the oldest bucket")
    void longOverdueIsAged() {
        UUID customerId = customer("Overdue " + run, new BigDecimal("1000.00"));

        installments.create(new InstallmentPlanRequest(
                customerId, outletId, null, 300_00L, 0L, "monthly", 3,
                LocalDate.now().minusDays(120), null, List.of()), actor, "127.0.0.1");

        CustomerStatement statement = credit.statement(customerId);
        // A plan is as late as its *earliest* arrears, and the first instalment
        // fell due 120 days ago — so the whole outstanding balance is over 60.
        assertEquals(0, statement.ageing().over60Days().compareTo(new BigDecimal("300.00")),
                "ageing was " + statement.ageing());
        assertEquals(0, statement.ageing().current().compareTo(BigDecimal.ZERO));
    }

    @Test
    @DisplayName("lowering a limit below what is owed reports over-limit rather than refusing to answer")
    void loweringTheLimitReportsOverLimit() {
        UUID customerId = customer("Lowered " + run, new BigDecimal("1000.00"));

        installments.create(new InstallmentPlanRequest(
                customerId, outletId, null, 800_00L, 0L, "monthly", 4,
                LocalDate.now(), null, List.of()), actor, "127.0.0.1");

        Customer stored = customers.findById(customerId).orElseThrow();
        stored.setCreditLimit(new BigDecimal("200.00"));
        customers.save(stored);

        CustomerStatement statement = credit.statement(customerId);
        assertTrue(statement.overLimit(), "GH₵800 owed against a GH₵200 limit");
        // Available is floored at zero rather than going negative — a shop
        // cannot extend minus six hundred cedis of credit.
        assertEquals(0, statement.available().compareTo(BigDecimal.ZERO),
                "available was " + statement.available());
    }

    private UUID customer(String name, BigDecimal limit) {
        String phone = "02%08d".formatted(Math.abs((name + run).hashCode()) % 100_000_000);
        Customer customer = new Customer(name, phone, CustomerType.CONTRACTOR,
                actor.userId(), java.time.Instant.now());
        customer.setCreditLimit(limit);
        return customers.save(customer).getId();
    }
}
