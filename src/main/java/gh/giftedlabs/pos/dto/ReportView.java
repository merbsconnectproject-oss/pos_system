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
    public record Summary(
            long saleCount,
            BigDecimal revenue,
            BigDecimal discountTotal,
            BigDecimal averageSale,
            long voidCount,
            BigDecimal voidedValue,
            /** FR-RPT-05: null unless the caller may see cost. */
            BigDecimal cost,
            BigDecimal profit,
            BigDecimal marginPercent) {
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
