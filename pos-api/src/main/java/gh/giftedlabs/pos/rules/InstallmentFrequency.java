package gh.giftedlabs.pos.rules;

import java.time.LocalDate;
import java.util.Optional;

/**
 * How often an installment falls due.
 *
 * <p>The enum owns the date arithmetic so the schedule is generated one way. A
 * monthly plan starting on the 31st is the case that catches naive code:
 * {@code plusMonths} clamps to the end of a short month, which is the behaviour
 * a shop expects — the end of February, not the 3rd of March.
 */
public enum InstallmentFrequency {

    WEEKLY("weekly"),
    BIWEEKLY("biweekly"),
    MONTHLY("monthly");

    private final String key;

    InstallmentFrequency(String key) {
        this.key = key;
    }

    public String key() {
        return key;
    }

    /** The date of installment {@code n}, counting the first as 1. */
    public LocalDate dueDate(LocalDate start, int installmentNumber) {
        int steps = installmentNumber - 1;
        return switch (this) {
            case WEEKLY -> start.plusWeeks(steps);
            case BIWEEKLY -> start.plusWeeks(2L * steps);
            case MONTHLY -> start.plusMonths(steps);
        };
    }

    public static Optional<InstallmentFrequency> ofKey(String key) {
        if (key == null) return Optional.empty();
        for (InstallmentFrequency frequency : values()) {
            if (frequency.name().equalsIgnoreCase(key.trim())
                    || frequency.key.equalsIgnoreCase(key.trim())) {
                return Optional.of(frequency);
            }
        }
        return Optional.empty();
    }
}
