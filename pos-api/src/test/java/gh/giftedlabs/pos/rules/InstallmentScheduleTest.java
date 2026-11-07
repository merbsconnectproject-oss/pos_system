package gh.giftedlabs.pos.rules;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Splitting a balance — BR-11.
 *
 * <p>No database, because the rule is arithmetic and the arithmetic is where the
 * money goes missing.
 */
@DisplayName("Installment schedule — BR-11")
class InstallmentScheduleTest {

    private static final LocalDate START = LocalDate.of(2026, 1, 15);

    @Test
    @DisplayName("the installments sum to the balance exactly, to the pesewa")
    void sumsExactly() {
        // 1000 over 3 is the case that breaks naive code: 333.33 three times is
        // a pesewa short of 1000.
        List<InstallmentSchedule.Due> schedule =
                InstallmentSchedule.split(100_000, 3, START, InstallmentFrequency.MONTHLY);

        assertEquals(100_000, schedule.stream().mapToLong(InstallmentSchedule.Due::expectedPesewas).sum(),
                "BR-11: a plan that does not sum to the balance leaves a debt nobody can settle");
    }

    @Test
    @DisplayName("the odd pesewa goes on the first installment, not the last")
    void remainderGoesFirst() {
        List<InstallmentSchedule.Due> schedule =
                InstallmentSchedule.split(100_000, 3, START, InstallmentFrequency.MONTHLY);

        // A customer who pays every installment as quoted and still owes a penny
        // at the end is a support call. One who pays a penny more at the start
        // never notices.
        assertEquals(33_334, schedule.get(0).expectedPesewas());
        assertEquals(33_333, schedule.get(1).expectedPesewas());
        assertEquals(33_333, schedule.get(2).expectedPesewas());
    }

    @Test
    @DisplayName("an exact division leaves every installment equal")
    void exactDivision() {
        List<InstallmentSchedule.Due> schedule =
                InstallmentSchedule.split(90_000, 3, START, InstallmentFrequency.WEEKLY);

        assertTrue(schedule.stream().allMatch(due -> due.expectedPesewas() == 30_000));
    }

    @Test
    @DisplayName("monthly dues clamp to the end of a short month")
    void monthlyClampsToShortMonths() {
        // A plan starting on the 31st of January. February has no 31st, and the
        // shop expects the end of February rather than the 3rd of March.
        List<InstallmentSchedule.Due> schedule = InstallmentSchedule.split(
                90_000, 3, LocalDate.of(2026, 1, 31), InstallmentFrequency.MONTHLY);

        assertEquals(LocalDate.of(2026, 1, 31), schedule.get(0).dueDate());
        assertEquals(LocalDate.of(2026, 2, 28), schedule.get(1).dueDate());
        assertEquals(LocalDate.of(2026, 3, 31), schedule.get(2).dueDate());
    }

    @Test
    @DisplayName("weekly and biweekly step by the right number of days")
    void frequencySteps() {
        assertEquals(LocalDate.of(2026, 1, 22),
                InstallmentFrequency.WEEKLY.dueDate(START, 2));
        assertEquals(LocalDate.of(2026, 1, 29),
                InstallmentFrequency.BIWEEKLY.dueDate(START, 2));
        // The first installment is due on the start date, not a period after it.
        assertEquals(START, InstallmentFrequency.MONTHLY.dueDate(START, 1));
    }

    @Test
    @DisplayName("a balance too small to divide is refused rather than rounded to zero")
    void refusesUnsplittableBalance() {
        // 3 pesewas over 4 installments would need one of them to be nothing,
        // and a zero-value installment is a row that can never be paid.
        assertThrows(IllegalArgumentException.class,
                () -> InstallmentSchedule.split(3, 4, START, InstallmentFrequency.WEEKLY));
    }

    @Test
    @DisplayName("nothing left to spread is refused")
    void refusesZeroBalance() {
        assertThrows(IllegalArgumentException.class,
                () -> InstallmentSchedule.split(0, 3, START, InstallmentFrequency.MONTHLY));
    }
}
