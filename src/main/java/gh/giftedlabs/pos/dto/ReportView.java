package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * What the reports screen renders — FR-RPT-04.
 *
 * <p>Cost and profit are nullable on every shape in here, and that is
 * FR-RPT-05 rather than laziness: a caller without {@code report.view_profit}
 * is sent a row with no cost in it, not a row with a cost the screen promises
 * to hide.
 */
public final class ReportView {

    private ReportView() { }

    /** The headline figures for a period — FR-RPT-04 sales summary. */
    /**
     * @param revenue     gross takings — what was rung up
     * @param refundTotal what went back out as returns in the same period
     * @param netRevenue  revenue less refunds. **This is the sales figure.**
     *                    Gross is kept beside it because a shop wants to see
     *                    both: takings of 10,000 with 3,000 returned is a
     *                    different month from takings of 7,000 with none
     * @param cost        BR-5 frozen cost of what was sold, less the cost of
     *                    what came back and went on the shelf again
     * @param profit      netRevenue less cost. Null unless the caller may see
     *                    cost — FR-RPT-05
     */
    public record Summary(
            long saleCount,
            BigDecimal revenue,
            BigDecimal discountTotal,
            BigDecimal averageSale,
            long voidCount,
            BigDecimal voidedValue,
            long refundCount,
            BigDecimal refundTotal,
            BigDecimal netRevenue,
            /** FR-RPT-05: null unless the caller may see cost. */
            BigDecimal cost,
            BigDecimal profit,
            BigDecimal marginPercent) {
    }

    /**
     * The profit and loss statement — {@code report.view_pl}.
     *
     * <p>Gross profit is trading: revenue less the cost of what was sold. Net
     * profit takes the operating expenses off it, which is the figure that says
     * whether the business made money. They are two disclosures, not one — the
     * second exposes the whole cost base, rent and salaries included — so they
     * sit behind two different permissions.
     *
     * <p>Every figure is summed by the database over the period. The screen this
     * replaces built the same statement from whatever the browser had loaded and
     * from expenses held in a React array, so the net profit an owner read was a
     * number about nothing and reset to zero on refresh.
     *
     * @param operatingExpenses    PAID expenses only, in the period
     * @param pendingExpenses      committed and not yet paid — reported beside the
     *                             statement rather than inside it, because an
     *                             unpaid invoice has not reduced the bank balance
     * @param expensesByCategory   the breakdown an owner actually reads
     * @param netProfit            gross profit less operating expenses
     * @param netMarginPercent     null when there was no revenue to divide by
     */
    public record ProfitAndLoss(
            Instant from,
            Instant to,
            long saleCount,
            BigDecimal revenue,
            BigDecimal costOfSales,
            BigDecimal grossProfit,
            BigDecimal grossMarginPercent,
            BigDecimal operatingExpenses,
            BigDecimal pendingExpenses,
            List<ExpenseLine> expensesByCategory,
            BigDecimal netProfit,
            BigDecimal netMarginPercent) {

        /** One category's total, with the label the screen shows. */
        public record ExpenseLine(String category, String label, BigDecimal amount) {
        }
    }

    /**
     * One line of a grouped report — by product, category, cashier, customer,
     * payment method or movement type.
     *
     * <p>{@code quantity} means different things per grouping — units for a
     * product, receipts for a cashier — which is why the row carries a
     * {@code quantityLabel} rather than the screen guessing.
     */
    public record Row(
            String key,
            String name,
            String secondary,
            BigDecimal quantity,
            BigDecimal revenue,
            BigDecimal cost,
            BigDecimal profit) {
    }

    /** FR-RPT-04 stock on hand, inventory valuation and low stock. */
    public record StockRow(
            UUID productId,
            String sku,
            String name,
            String category,
            UUID outletId,
            String outletName,
            BigDecimal quantity,
            BigDecimal reorderLevel,
            boolean low,
            BigDecimal averageCost,
            BigDecimal valueAtCost,
            BigDecimal retailPrice) {
    }

    /** FR-RPT-04 discount and override log, and void log. */
    public record ExceptionRow(
            Instant at,
            String receiptNumber,
            UUID outletId,
            String outletName,
            String productName,
            String detail,
            BigDecimal amount,
            String actor,
            String approver,
            String reason) {
    }

    /**
     * A day (or month) on a chart — FR-RPT-04.
     *
     * <p>Sales and purchases on the same bucket, because the dashboard chart
     * draws them against each other and two separate series would have to be
     * lined up by whoever read them.
     */
    public record SeriesPoint(
            String bucket,
            BigDecimal sales,
            BigDecimal purchases,
            long receipts) {
    }

    /** FR-RPT-01 · FR-RPT-02: one card per outlet, plus the combined line. */
    public record DashboardOutlet(
            UUID outletId,
            String outletCode,
            String outletName,
            BigDecimal salesToday,
            long receiptsToday,
            BigDecimal expectedCash,
            long lowStockCount,
            long openShifts,
            BigDecimal profitToday) {
    }

    public record Dashboard(
            Instant asOf,
            List<DashboardOutlet> outlets,
            DashboardOutlet combined) {
    }
}
