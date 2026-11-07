package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.CustomerStatement;

import java.util.UUID;

/**
 * FR-CUST-07: credit limits, balances, ageing and statements.
 *
 * <p>Separate from {@link CustomerService} because it is about money the
 * customer owes rather than about the customer record, and the two are read by
 * different people for different reasons — a cashier looks somebody up by
 * phone; an owner reads who is behind.
 */
public interface CustomerCreditService {

    /** What this customer owes, how old it is, and on which plans. */
    CustomerStatement statement(UUID customerId);

    /**
     * Refuse a new plan that would take this customer past their limit.
     *
     * <p>Throws rather than returning a boolean: there is exactly one correct
     * response to being over the limit, and a caller that could forget to check
     * the boolean is a caller that will.
     *
     * <p>A customer with no limit set is not held to one: the column defaults
     * to zero, so the opposite reading would have the upgrade that introduces
     * limits deny credit to every customer a shop already serves.
     *
     * @param additionalPesewas what the new plan would add to the balance
     */
    void requireWithinLimit(UUID customerId, long additionalPesewas);
}
