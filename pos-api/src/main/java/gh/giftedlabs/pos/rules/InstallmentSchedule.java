package gh.giftedlabs.pos.rules;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Splitting a balance into installments — BR-11.
 *
 * <p>Pure arithmetic, no database, so the rounding rule can be asserted directly.
 * The rule is the one BR-11 forces: the installments must sum to the balance
 * exactly. Dividing 1000 by 3 and rounding each share gives 333.33 three times,
 * which is a penny short — so the remainder goes on the <em>first</em>
 * installment rather than the last.
 *
 * <p>First, not last, because a customer who pays every instalment as quoted and
 * still owes a penny at the end is a support call; one who pays a penny more at
 * the start never notices.
 */
public final class InstallmentSchedule {

    private InstallmentSchedule() {
    }

    /** One due installment: when, and how much. */
    public record Due(int installmentNumber, LocalDate dueDate, long expectedPesewas) {
    }

    /**
     * @param balancePesewas what is left after any down payment
     * @throws IllegalArgumentException if there is nothing to spread, or nothing
     *                                  to spread it over
     */
    public static List<Due> split(long balancePesewas, int installmentCount,
                                  LocalDate start, InstallmentFrequency frequency) {
        if (balancePesewas <= 0) {
            throw new IllegalArgumentException("There is no balance left to spread over installments");
        }
        if (installmentCount < 1) {
            throw new IllegalArgumentException("A plan needs at least one installment");
        }
        if (installmentCount > balancePesewas) {
            // A pesewa is the smallest thing that can be owed; 3 pesewas cannot
            // become 4 installments without one of them being zero.
            throw new IllegalArgumentException(
                    "%d installments cannot divide %d pesewas — each one would be less than a pesewa"
                            .formatted(installmentCount, balancePesewas));
        }

        long each = balancePesewas / installmentCount;
        long remainder = balancePesewas - (each * installmentCount);

        List<Due> schedule = new ArrayList<>(installmentCount);
        for (int number = 1; number <= installmentCount; number++) {
            long amount = each + (number == 1 ? remainder : 0);
            schedule.add(new Due(number, frequency.dueDate(start, number), amount));
        }
        return List.copyOf(schedule);
    }
}
