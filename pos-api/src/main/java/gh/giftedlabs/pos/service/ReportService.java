package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.ReportFilter;
import gh.giftedlabs.pos.dto.ReportView;

import java.util.List;
import java.util.UUID;

/**
 * Reports — FR-RPT.
 *
 * <p>Every figure in here is aggregated by the database over the whole period
 * asked for. The screen used to add up whichever sales it happened to have
 * loaded, which is right at a hundred sales and quietly wrong at a hundred and
 * one — a year-to-date total that silently means "the last hundred receipts".
 *
 * <p>{@code mayViewProfit} is passed into every call rather than checked at the
 * edge, because FR-RPT-05 is about what is <em>computed and sent</em>, not what
 * is displayed. A cost that reaches the browser has left the building.
 */
public interface ReportService {

    /** FR-RPT-04 sales summary. */
    ReportView.Summary summary(ReportFilter filter, boolean mayViewProfit);

    /** How a grouped report is grouped — FR-RPT-04. */
    enum Grouping { PRODUCT, CATEGORY, CASHIER, CUSTOMER, CUSTOMER_TYPE, PAYMENT, MOVEMENT }

    List<ReportView.Row> breakdown(Grouping grouping, ReportFilter filter, boolean mayViewProfit, int limit);

    /** FR-RPT-04 best sellers and slow movers. */
    enum Ranking { BEST, SLOW }

    List<ReportView.Row> ranking(Ranking ranking, ReportFilter filter, boolean mayViewProfit, int limit);

    /**
     * FR-RPT-04: takings and purchases over time, for the dashboard chart.
     *
     * <p>Every bucket in the range is returned, including the ones with no
     * trade. A chart that omits the quiet days draws a line that is not the
     * shape of the business.
     */
    enum Bucket { DAY, WEEK, MONTH }

    List<ReportView.SeriesPoint> series(Bucket bucket, ReportFilter filter);

    /** FR-RPT-04 stock on hand, inventory valuation, low stock. */
    enum StockView { ON_HAND, VALUATION, LOW }

    List<ReportView.StockRow> stock(StockView view, ReportFilter filter, boolean mayViewProfit, int limit);

    /** FR-RPT-04 discount and override log, void log. */
    enum ExceptionLog { DISCOUNT, VOID }

    List<ReportView.ExceptionRow> exceptions(ExceptionLog log, ReportFilter filter, int limit);

    /**
     * FR-RPT-01 · FR-RPT-02: the dashboard.
     *
     * <p>Returns a card per outlet the caller may see and a combined line. An
     * owner gets both shops and the total; a manager gets their own shop, and
     * the "combined" line is then that one shop, which is the truthful answer
     * rather than a total they are not entitled to.
     */
    /**
     * The profit and loss statement — {@code report.view_pl}.
     *
     * <p>Gross profit less what the business spent running itself. Needs no
     * {@code mayViewProfit} flag: unlike the other reports, there is no version
     * of a P&L with the cost withheld — a statement without cost of sales is not
     * a redacted P&L, it is a different document. The permission gates the whole
     * endpoint instead.
     */
    ReportView.ProfitAndLoss profitAndLoss(ReportFilter filter);

    ReportView.Dashboard dashboard(List<UUID> visibleOutletIds, boolean mayViewProfit);
}
