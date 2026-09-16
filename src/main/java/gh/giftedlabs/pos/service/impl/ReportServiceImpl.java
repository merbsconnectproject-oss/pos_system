package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.ReportFilter;
import gh.giftedlabs.pos.rules.ExpenseCategory;
import gh.giftedlabs.pos.dto.ReportView;
import gh.giftedlabs.pos.service.ReportService;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * FR-RPT.
 *
 * <p>JdbcTemplate rather than JPA. These are aggregates over whole tables with
 * no object to hydrate, and the one thing that matters is that the sum is done
 * by the database over every row rather than by anything over a page of them.
 *
 * <p>BR-5 · FR-RPT-06 runs through all of it: cost comes from
 * {@code sale_item.cost_at_sale}, frozen when the sale was made. Joining to the
 * product's current cost would restate last year's profit every time somebody
 * receives stock at a new price.
 */
@Service
public class ReportServiceImpl implements ReportService {

    /**
     * BR-3: a voided sale is not revenue.
     *
     * <p>Repeated in every query rather than factored into a view, because a
     * report that quietly included voids would be the kind of wrong that looks
     * plausible for a month.
     */
    private static final String COMPLETED = " and s.status = 'COMPLETED' ";

    /**
     * The same window as {@link #SALE_SCOPE}, applied to the return's own date.
     *
     * <p>Goods bought in September and brought back in October come off October,
     * which is when the money actually left the drawer. Filtering by the original
     * sale's date instead would move a refund into a month that has already been
     * reported on.
     *
     * <p>There is no cashier clause: a return is netted against the cashier who
     * <em>sold</em> the goods, not whoever happened to handle the counter when
     * they came back — a sales report that docked the second person would rank
     * staff by who was unlucky.
     */
    private static final String RETURN_SCOPE = """
             where 1 = 1
               and (cast(:from as timestamptz) is null or r.created_at >= cast(:from as timestamptz))
               and (cast(:to   as timestamptz) is null or r.created_at <= cast(:to   as timestamptz))
               and (cast(:outletId as uuid) is null or r.outlet_id = cast(:outletId as uuid))
            """;

    /**
     * What a returned line does to cost.
     *
     * <p>A restocked item reverses its cost — it was not sold after all. One
     * written off or sent to a supplier does not: the shop still paid for stock
     * it no longer has, so the cost stays and the loss is real. Reversing both
     * would hide write-offs inside the margin.
     */
    private static final String RETURN_COST =
            "case when ri.disposition = 'RESTOCK' "
            + "then -round(ri.frozen_cost_price * ri.quantity_base * 100) else 0 end";

    private static final String SALE_SCOPE = """
             where 1 = 1
               and (cast(:from as timestamptz) is null or s.created_at >= cast(:from as timestamptz))
               and (cast(:to   as timestamptz) is null or s.created_at <= cast(:to   as timestamptz))
               and (cast(:outletId as uuid) is null or s.outlet_id = cast(:outletId as uuid))
               and (cast(:userId   as uuid) is null or s.cashier_id = cast(:userId as uuid))
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;

    public ReportServiceImpl(NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    // --- FR-RPT-04 · sales summary -----------------------------------------

    @Override
    @Transactional(readOnly = true)
    public ReportView.Summary summary(ReportFilter filter, boolean mayViewProfit) {
        String sql = """
                select
                    count(*) filter (where s.status = 'COMPLETED')                           as sale_count,
                    coalesce(sum(s.total)          filter (where s.status = 'COMPLETED'), 0) as revenue,
                    coalesce(sum(s.discount_total) filter (where s.status = 'COMPLETED'), 0) as discount_total,
                    count(*) filter (where s.status = 'VOIDED')                              as void_count,
                    coalesce(sum(s.total)          filter (where s.status = 'VOIDED'), 0)    as voided_value,
                    -- BR-5 · FR-RPT-06: the cost frozen on each line when it was
                    -- sold, never the product's cost today.
                    coalesce(sum(li.cost) filter (where s.status = 'COMPLETED'), 0)          as cost
                  from sale s
                  left join lateral (
                       select sum(round(i.frozen_cost_price * i.quantity_base * 100)) as cost
                         from sale_item i where i.sale_id = s.id
                  ) li on true
                 %s
                """.formatted(SALE_SCOPE);

        return jdbc.query(sql, parameters(filter), rows -> {
            if (!rows.next()) return empty(mayViewProfit);

            long saleCount = rows.getLong("sale_count");
            BigDecimal revenue = major(rows.getLong("revenue"));
            BigDecimal discount = major(rows.getLong("discount_total"));
            long voidCount = rows.getLong("void_count");
            BigDecimal voided = major(rows.getLong("voided_value"));
            BigDecimal average = saleCount == 0 ? BigDecimal.ZERO
                    : revenue.divide(BigDecimal.valueOf(saleCount), 2, RoundingMode.HALF_UP);

            // Goods that came back in the same period. A refund is not a void:
            // the sale happened and keeps its receipt, but the money went back
            // and the takings have to say so.
            Returns back = returns(filter);
            BigDecimal netRevenue = revenue.subtract(back.refundTotal());

            if (!mayViewProfit) {
                return new ReportView.Summary(saleCount, revenue, discount, average,
                        voidCount, voided, back.count(), back.refundTotal(), netRevenue,
                        null, null, null);
            }

            // The cost of returned goods is reversed, because they were not sold
            // after all. Goods written off or sent back to a supplier reverse and
            // are then lost again — the shop still paid for stock it no longer
            // has — so their cost nets back in.
            BigDecimal cost = major(rows.getLong("cost"))
                    .subtract(back.returnedCost())
                    .add(back.writtenOffCost());

            BigDecimal profit = netRevenue.subtract(cost);
            BigDecimal margin = netRevenue.signum() == 0 ? BigDecimal.ZERO
                    : profit.multiply(BigDecimal.valueOf(100)).divide(netRevenue, 1, RoundingMode.HALF_UP);

            return new ReportView.Summary(saleCount, revenue, discount, average,
                    voidCount, voided, back.count(), back.refundTotal(), netRevenue,
                    cost, profit, margin);
        });
    }

    /** What came back in a period, and what it had cost. */
    private record Returns(long count, BigDecimal refundTotal, BigDecimal returnedCost,
                           BigDecimal writtenOffCost) {
    }

    /**
     * Returns in the period, counted separately from sales.
     *
     * <p>Its own query rather than a join onto the sales one: a sale may have
     * many returns and a return many lines, so joining would multiply the sale
     * totals by the number of rows that came back — the classic fan-out that
     * produces a plausible and badly wrong figure.
     *
     * <p>Filtered by when the <em>return</em> happened, not the sale. Goods
     * bought in September and brought back in October reduce October's takings,
     * which is when the money actually left.
     */
    private Returns returns(ReportFilter filter) {
        String sql = """
                select
                    count(distinct r.id)                                as return_count,
                    coalesce(sum(r.refund_total_pesewas) filter (
                        where ri.id is null), 0)                        as ignored_total,
                    coalesce(max(totals.refunded), 0)                   as refund_total,
                    coalesce(sum(round(ri.frozen_cost_price * ri.quantity_base * 100)), 0)
                                                                        as returned_cost,
                    coalesce(sum(round(ri.frozen_cost_price * ri.quantity_base * 100))
                        filter (where ri.disposition <> 'RESTOCK'), 0)  as written_off_cost
                  from sale_return r
                  left join sale_return_item ri on ri.return_id = r.id
                  left join lateral (
                        select sum(x.refund_total_pesewas) as refunded
                          from sale_return x
                         where (cast(:from as timestamptz) is null or x.created_at >= cast(:from as timestamptz))
                           and (cast(:to   as timestamptz) is null or x.created_at <= cast(:to   as timestamptz))
                           and (cast(:outletId as uuid) is null or x.outlet_id = cast(:outletId as uuid))
                  ) totals on true
                 where (cast(:from as timestamptz) is null or r.created_at >= cast(:from as timestamptz))
                   and (cast(:to   as timestamptz) is null or r.created_at <= cast(:to   as timestamptz))
                   and (cast(:outletId as uuid) is null or r.outlet_id = cast(:outletId as uuid))
                """;

        return jdbc.query(sql, parameters(filter), rows -> {
            if (!rows.next()) {
                BigDecimal zero = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
                return new Returns(0, zero, zero, zero);
            }
            return new Returns(
                    rows.getLong("return_count"),
                    major(rows.getLong("refund_total")),
                    major(rows.getLong("returned_cost")),
                    major(rows.getLong("written_off_cost")));
        });
    }

    // --- profit and loss ---------------------------------------------------

    /**
     * Trading, then what it cost to keep the doors open.
     *
     * <p>Two queries rather than one join. Sales and expenses share nothing but a
     * date range, and joining them would multiply every sale by every expense —
     * the classic fan-out that produces a plausible, badly wrong total.
     *
     * <p>The expense period is the date the money was spent, not when the row was
     * created, so rent entered late still lands in the month it belongs to.
     */
    @Override
    @Transactional(readOnly = true)
    public ReportView.ProfitAndLoss profitAndLoss(ReportFilter filter) {
        ReportView.Summary trading = summary(filter, true);

        String expenseSql = """
                select
                    e.category as category,
                    coalesce(sum(e.amount_pesewas) filter (where e.status = 'PAID'), 0)    as paid,
                    coalesce(sum(e.amount_pesewas) filter (where e.status = 'PENDING'), 0) as pending
                  from expense e
                 where e.is_voided = false
                   and (cast(:from as timestamptz) is null
                        or e.spent_on >= cast(cast(:from as timestamptz) as date))
                   and (cast(:to as timestamptz) is null
                        or e.spent_on <= cast(cast(:to as timestamptz) as date))
                   -- A cost carried by the business as a whole (outlet_id null)
                   -- belongs in either branch's view of its own P&L; leaving it
                   -- out would make the two outlets sum to less than the business.
                   and (cast(:outletId as uuid) is null
                        or e.outlet_id = cast(:outletId as uuid)
                        or e.outlet_id is null)
                 group by e.category
                 order by paid desc
                """;

        List<ReportView.ProfitAndLoss.ExpenseLine> lines = new ArrayList<>();
        long[] totals = new long[2];

        jdbc.query(expenseSql, parameters(filter), rows -> {
            long paid = rows.getLong("paid");
            long pending = rows.getLong("pending");
            totals[0] += paid;
            totals[1] += pending;

            String key = rows.getString("category");
            if (paid > 0) {
                String label = ExpenseCategory.ofKey(key).map(ExpenseCategory::label).orElse(key);
                lines.add(new ReportView.ProfitAndLoss.ExpenseLine(key, label, major(paid)));
            }
        });

        // Net of returns. A P&L built on gross takings would overstate the month
        // by everything that came back, and the owner would be reading a profit
        // the business never made.
        BigDecimal revenue = trading.netRevenue();
        BigDecimal cost = trading.cost() == null ? BigDecimal.ZERO.setScale(2) : trading.cost();
        BigDecimal gross = trading.profit() == null ? revenue.subtract(cost) : trading.profit();

        BigDecimal operating = major(totals[0]);
        BigDecimal pending = major(totals[1]);
        BigDecimal net = gross.subtract(operating);

        // Null rather than zero when there is no revenue. A margin of 0% reads as
        // "we sold things and made nothing", which is a different month from "we
        // sold nothing at all".
        BigDecimal netMargin = revenue.signum() == 0 ? null
                : net.multiply(BigDecimal.valueOf(100)).divide(revenue, 1, RoundingMode.HALF_UP);
        BigDecimal grossMargin = revenue.signum() == 0 ? null
                : trading.marginPercent();

        return new ReportView.ProfitAndLoss(
                filter.from(), filter.to(), trading.saleCount(),
                revenue, cost, gross, grossMargin,
                operating, pending, List.copyOf(lines),
                net, netMargin);
    }

    // --- FR-RPT-04 · grouped reports ---------------------------------------

    @Override
    @Transactional(readOnly = true)
    public List<ReportView.Row> breakdown(Grouping grouping, ReportFilter filter,
                                          boolean mayViewProfit, int limit) {
        return switch (grouping) {
            // Sold lines and returned lines in one stream, the returns negative.
            // A product with heavy returns has to fall down this ranking, not sit
            // near the top on goods that came straight back.
            case PRODUCT -> lineRows("""
                    with movement as (
                        select i.product_id,
                               i.quantity_base as quantity,
                               i.line_total as revenue,
                               round(i.frozen_cost_price * i.quantity_base * 100) as cost
                          from sale_item i
                          join sale s on s.id = i.sale_id
                         %1$s %2$s
                        union all
                        select ri.product_id,
                               -ri.quantity_base,
                               -ri.line_refund_pesewas,
                               %4$s
                          from sale_return_item ri
                          join sale_return r on r.id = ri.return_id
                         %3$s
                    )
                    select p.id::text as key, p.name as name, p.sku as secondary,
                           sum(m.quantity) as quantity,
                           sum(m.revenue) as revenue,
                           sum(m.cost) as cost
                      from movement m
                      join product p on p.id = m.product_id
                      left join category c on c.id = p.category_id
                     where 1 = 1 %5$s
                     group by p.id, p.name, p.sku
                     order by revenue desc
                     limit :limit
                    """.formatted(SALE_SCOPE, COMPLETED, RETURN_SCOPE, RETURN_COST,
                            categoryClause(filter)), filter, mayViewProfit, limit);

            case CATEGORY -> lineRows("""
                    with movement as (
                        select i.product_id,
                               i.quantity_base as quantity,
                               i.line_total as revenue,
                               round(i.frozen_cost_price * i.quantity_base * 100) as cost
                          from sale_item i
                          join sale s on s.id = i.sale_id
                         %1$s %2$s
                        union all
                        select ri.product_id, -ri.quantity_base, -ri.line_refund_pesewas, %4$s
                          from sale_return_item ri
                          join sale_return r on r.id = ri.return_id
                         %3$s
                    )
                    select coalesce(c.name, 'Uncategorised') as key,
                           coalesce(c.name, 'Uncategorised') as name,
                           null as secondary,
                           sum(m.quantity) as quantity,
                           sum(m.revenue) as revenue,
                           sum(m.cost) as cost
                      from movement m
                      join product p on p.id = m.product_id
                      left join category c on c.id = p.category_id
                     where 1 = 1 %5$s
                     group by 1, 2
                     order by revenue desc
                     limit :limit
                    """.formatted(SALE_SCOPE, COMPLETED, RETURN_SCOPE, RETURN_COST,
                            categoryClause(filter)), filter, mayViewProfit, limit);

            // Receipts, not units: a cashier sells whatever comes to the till,
            // and counting their units would rank whoever served the customer
            // buying cable by the hundred metres.
            // Returns are netted against whoever *sold* the goods, found through
            // the original sale — not against whoever was on the counter when
            // they came back. A ranking that docked the second person would sort
            // staff by who was unlucky.
            case CASHIER -> saleRows("""
                    with movement as (
                        select s.cashier_id, 1 as receipts, s.total as revenue,
                               coalesce(li.cost, 0) as cost
                          from sale s
                          left join lateral (
                               select sum(round(i.frozen_cost_price * i.quantity_base * 100)) as cost
                                 from sale_item i where i.sale_id = s.id
                          ) li on true
                         %1$s %2$s
                        union all
                        select orig.cashier_id, 0, -ri.line_refund_pesewas, %4$s
                          from sale_return_item ri
                          join sale_return r on r.id = ri.return_id
                          join sale orig on orig.id = r.original_sale_id
                         %3$s
                    )
                    select u.id::text as key,
                           coalesce(u.full_name, u.username) as name,
                           'Completed receipts' as secondary,
                           sum(m.receipts) as quantity,
                           sum(m.revenue) as revenue,
                           sum(m.cost) as cost
                      from movement m
                      join app_user u on u.id = m.cashier_id
                     group by u.id, coalesce(u.full_name, u.username)
                     order by revenue desc
                     limit :limit
                    """.formatted(SALE_SCOPE, COMPLETED, RETURN_SCOPE, RETURN_COST),
                    filter, mayViewProfit, limit);

            // FR-CUST-01: sales with no customer are a real row, not a gap.
            case CUSTOMER -> saleRows("""
                    with movement as (
                        select coalesce(s.customer_id::text, 'walk-in') as key,
                               coalesce(s.customer_name, 'Walk-in customer') as name,
                               s.customer_phone as phone,
                               1 as receipts, s.total as revenue, coalesce(li.cost, 0) as cost
                          from sale s
                          left join lateral (
                               select sum(round(i.frozen_cost_price * i.quantity_base * 100)) as cost
                                 from sale_item i where i.sale_id = s.id
                          ) li on true
                         %1$s %2$s
                        union all
                        -- Against the customer on the original sale: what they
                        -- kept is what they bought less what they brought back.
                        select coalesce(orig.customer_id::text, 'walk-in'),
                               coalesce(orig.customer_name, 'Walk-in customer'),
                               orig.customer_phone,
                               0, -ri.line_refund_pesewas, %4$s
                          from sale_return_item ri
                          join sale_return r on r.id = ri.return_id
                          join sale orig on orig.id = r.original_sale_id
                         %3$s
                    )
                    select m.key as key, max(m.name) as name, max(m.phone) as secondary,
                           sum(m.receipts) as quantity,
                           sum(m.revenue) as revenue,
                           sum(m.cost) as cost
                      from movement m
                     group by m.key
                     order by revenue desc
                     limit :limit
                    """.formatted(SALE_SCOPE, COMPLETED, RETURN_SCOPE, RETURN_COST), filter, mayViewProfit, limit);

            // Payments, not sales: one sale split across cash and mobile money
            // is two rows here and one row everywhere else, which is the point
            // of a payment-method breakdown.
            // FR-CUST-04: by the kind of customer, which is what an owner asks
            // — "how much of this is trade?" — rather than by each person.
            case CUSTOMER_TYPE -> saleRows("""
                    select coalesce(c.type, 'walk-in') as key,
                           coalesce(c.type, 'walk-in') as name,
                           null as secondary,
                           count(*) as quantity,
                           sum(s.total) as revenue,
                           coalesce(sum(li.cost), 0) as cost
                      from sale s
                      left join customer c on c.id = s.customer_id
                      left join lateral (
                           select sum(round(i.frozen_cost_price * i.quantity_base * 100)) as cost
                             from sale_item i where i.sale_id = s.id
                      ) li on true
                     %s %s
                     group by 1, 2
                     order by revenue desc
                     limit :limit
                    """.formatted(SALE_SCOPE, COMPLETED), filter, mayViewProfit, limit);

            case PAYMENT -> paymentRows(filter, limit);

            case MOVEMENT -> movementRows(filter, limit);
        };
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReportView.Row> ranking(Ranking ranking, ReportFilter filter,
                                        boolean mayViewProfit, int limit) {
        if (ranking == Ranking.BEST) {
            return breakdown(Grouping.PRODUCT, filter, mayViewProfit, limit);
        }

        // Slow movers are not "the bottom of the best sellers". A product that
        // sold nothing at all never appears in a sales table, and those are
        // exactly the ones worth seeing — so this starts from stock, not sales.
        String sql = """
                select p.id::text as key, p.name as name, p.sku as secondary,
                       coalesce(sold.quantity, 0) as quantity,
                       coalesce(sold.revenue, 0) as revenue,
                       coalesce(sold.cost, 0) as cost
                  from product p
                  join stock_level sl on sl.product_id = p.id
                  left join category c on c.id = p.category_id
                  left join lateral (
                       select sum(i.quantity_base) as quantity,
                              sum(i.line_total) as revenue,
                              sum(round(i.frozen_cost_price * i.quantity_base * 100)) as cost
                         from sale_item i
                         join sale s on s.id = i.sale_id
                        where i.product_id = p.id
                          and s.status = 'COMPLETED'
                          and (cast(:from as timestamptz) is null or s.created_at >= cast(:from as timestamptz))
                          and (cast(:to   as timestamptz) is null or s.created_at <= cast(:to   as timestamptz))
                          and (cast(:outletId as uuid) is null or s.outlet_id = cast(:outletId as uuid))
                  ) sold on true
                 where sl.quantity > 0
                   and (cast(:outletId as uuid) is null or sl.outlet_id = cast(:outletId as uuid))
                   and (cast(:category as text) is null or c.name = cast(:category as text))
                 group by p.id, p.name, p.sku, sold.quantity, sold.revenue, sold.cost
                 order by coalesce(sold.quantity, 0) asc, p.name
                 limit :limit
                """;
        return lineRows(sql, filter, mayViewProfit, limit);
    }

    // --- FR-RPT-04 · the dashboard chart -----------------------------------

    /**
     * FR-RPT-04: takings and purchases per bucket.
     *
     * <p>Built from a generated series of dates rather than from the sales, so
     * a day with no trade is a zero on the chart instead of a missing point.
     * A line drawn only through the busy days is the wrong shape.
     *
     * <p>Purchases are goods received valued at what was paid — the other side
     * of the same chart, and the reason an owner looks at it.
     */
    @Override
    @Transactional(readOnly = true)
    public List<ReportView.SeriesPoint> series(Bucket bucket, ReportFilter filter) {
        String step = switch (bucket) {
            case DAY -> "day";
            case WEEK -> "week";
            case MONTH -> "month";
        };
        String label = bucket == Bucket.MONTH ? "YYYY-MM" : "YYYY-MM-DD";

        String sql = """
                with bounds as (
                    select date_trunc('%1$s', coalesce(cast(:from as timestamptz), now() - interval '30 days')) as lo,
                           date_trunc('%1$s', coalesce(cast(:to   as timestamptz), now()))                      as hi
                ),
                buckets as (
                    select generate_series(lo, hi, ('1 %1$s')::interval) as bucket from bounds
                ),
                -- Each table is read once and grouped, then joined to the buckets.
                --
                -- This was a lateral subquery per bucket, and `date_trunc(created_at)
                -- = bucket` inside it cannot use the index on created_at — so a
                -- year's chart scanned the sale table 365 times and took 1.2 s of a
                -- 2 s budget. Comparing the raw column against the bucket's range
                -- instead keeps the index in play, and the scan happens once.
                sold as (
                    select date_trunc('%1$s', s.created_at) as bucket,
                           sum(s.total) as revenue, count(*) as receipts
                      from sale s, bounds
                     where s.status = 'COMPLETED'
                       and s.created_at >= bounds.lo
                       and s.created_at < bounds.hi + ('1 %1$s')::interval
                       and (cast(:outletId as uuid) is null or s.outlet_id = cast(:outletId as uuid))
                     group by 1
                ),
                back as (
                    -- Bucketed by when the return happened, like the summary: the
                    -- money left the drawer that day, not on the day of the sale.
                    select date_trunc('%1$s', r.created_at) as bucket,
                           sum(r.refund_total_pesewas) as refunded
                      from sale_return r, bounds
                     where r.created_at >= bounds.lo
                       and r.created_at < bounds.hi + ('1 %1$s')::interval
                       and (cast(:outletId as uuid) is null or r.outlet_id = cast(:outletId as uuid))
                     group by 1
                ),
                bought as (
                    select date_trunc('%1$s', m.created_at) as bucket,
                           sum(round(abs(m.quantity_delta) * coalesce(m.unit_cost, 0) * 100)) as value
                      from inventory_movement m, bounds
                     where m.type = 'RECEIPT'
                       and m.created_at >= bounds.lo
                       and m.created_at < bounds.hi + ('1 %1$s')::interval
                       and (cast(:outletId as uuid) is null or m.outlet_id = cast(:outletId as uuid))
                     group by 1
                )
                select to_char(b.bucket, '%2$s') as label,
                       -- Net of what came back in the same bucket. A chart drawn
                       -- on gross takings shows a good week that was really a
                       -- week of selling and unselling the same goods.
                       coalesce(sold.revenue, 0) - coalesce(back.refunded, 0) as sales,
                       coalesce(sold.receipts, 0)  as receipts,
                       coalesce(bought.value, 0)   as purchases
                  from buckets b
                  left join sold   on sold.bucket   = b.bucket
                  left join back   on back.bucket   = b.bucket
                  left join bought on bought.bucket = b.bucket
                 order by b.bucket
                """.formatted(step, label);

        return jdbc.query(sql, parameters(filter), (row, index) -> new ReportView.SeriesPoint(
                row.getString("label"),
                major(row.getLong("sales")),
                major(row.getLong("purchases")),
                row.getLong("receipts")));
    }

    // --- FR-RPT-04 · stock -------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public List<ReportView.StockRow> stock(StockView view, ReportFilter filter,
                                           boolean mayViewProfit, int limit) {
        String having = switch (view) {
            case LOW -> " and sl.quantity <= sl.reorder_level ";
            // Valuation is about what is on the shelf; a zero row values nothing
            // and pushes the rows that matter off the first page.
            case VALUATION -> " and sl.quantity > 0 ";
            case ON_HAND -> "";
        };

        String sql = """
                select p.id::text as product_id, p.sku, p.name,
                       coalesce(c.name, 'Uncategorised') as category,
                       o.id::text as outlet_id, o.name as outlet_name,
                       sl.quantity, sl.reorder_level, sl.average_cost, p.retail_price
                  from stock_level sl
                  join product p on p.id = sl.product_id
                  join outlet o on o.id = sl.outlet_id
                  left join category c on c.id = p.category_id
                 where p.is_active = true
                   and (cast(:outletId as uuid) is null or sl.outlet_id = cast(:outletId as uuid))
                   and (cast(:category as text) is null or c.name = cast(:category as text))
                   %s
                 order by %s
                 limit :limit
                """.formatted(having, view == StockView.VALUATION
                        ? "sl.quantity * sl.average_cost desc"
                        : "p.name");

        return jdbc.query(sql, parameters(filter).addValue("limit", limit), (row, index) -> {
            BigDecimal quantity = row.getBigDecimal("quantity");
            BigDecimal reorder = row.getBigDecimal("reorder_level");
            BigDecimal cost = row.getBigDecimal("average_cost");

            return new ReportView.StockRow(
                    UUID.fromString(row.getString("product_id")),
                    row.getString("sku"),
                    row.getString("name"),
                    row.getString("category"),
                    UUID.fromString(row.getString("outlet_id")),
                    row.getString("outlet_name"),
                    quantity,
                    reorder,
                    quantity.compareTo(reorder) <= 0,
                    // FR-RPT-05: cost and the value derived from it, or neither.
                    mayViewProfit ? cost : null,
                    mayViewProfit ? quantity.multiply(cost).setScale(2, RoundingMode.HALF_UP) : null,
                    row.getBigDecimal("retail_price"));
        });
    }

    // --- FR-RPT-04 · the logs ----------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public List<ReportView.ExceptionRow> exceptions(ExceptionLog log, ReportFilter filter, int limit) {
        String sql = log == ExceptionLog.VOID ? """
                select s.voided_at as at, s.receipt_number, s.outlet_id::text as outlet_id,
                       o.name as outlet_name, null as product_name,
                       'Sale voided' as detail, s.total as amount,
                       coalesce(c.full_name, c.username) as actor,
                       coalesce(v.full_name, v.username) as approver,
                       s.void_reason as reason
                  from sale s
                  join outlet o on o.id = s.outlet_id
                  left join app_user c on c.id = s.cashier_id
                  left join app_user v on v.id = s.voided_by
                 where s.status = 'VOIDED'
                   and (cast(:from as timestamptz) is null or s.voided_at >= cast(:from as timestamptz))
                   and (cast(:to   as timestamptz) is null or s.voided_at <= cast(:to   as timestamptz))
                   and (cast(:outletId as uuid) is null or s.outlet_id = cast(:outletId as uuid))
                 order by s.voided_at desc
                 limit :limit
                """ : """
                select s.created_at as at, s.receipt_number, s.outlet_id::text as outlet_id,
                       o.name as outlet_name, p.name as product_name,
                       case when i.floor_approved_by is not null then 'Below floor price'
                            else 'Line discount' end as detail,
                       case when i.floor_approved_by is not null
                            then round((p.floor_price * i.conversion_factor - i.unit_price) * i.quantity * 100)
                            else i.discount end as amount,
                       coalesce(c.full_name, c.username) as actor,
                       coalesce(a.full_name, a.username) as approver,
                       null as reason
                  from sale_item i
                  join sale s on s.id = i.sale_id
                  join outlet o on o.id = s.outlet_id
                  join product p on p.id = i.product_id
                  left join app_user c on c.id = s.cashier_id
                  left join app_user a on a.id = i.floor_approved_by
                 where (i.discount > 0 or i.floor_approved_by is not null)
                   and (cast(:from as timestamptz) is null or s.created_at >= cast(:from as timestamptz))
                   and (cast(:to   as timestamptz) is null or s.created_at <= cast(:to   as timestamptz))
                   and (cast(:outletId as uuid) is null or s.outlet_id = cast(:outletId as uuid))
                 order by s.created_at desc
                 limit :limit
                """;

        return jdbc.query(sql, parameters(filter).addValue("limit", limit), (row, index) ->
                new ReportView.ExceptionRow(
                        row.getTimestamp("at") == null ? null : row.getTimestamp("at").toInstant(),
                        row.getString("receipt_number"),
                        UUID.fromString(row.getString("outlet_id")),
                        row.getString("outlet_name"),
                        row.getString("product_name"),
                        row.getString("detail"),
                        major(row.getLong("amount")),
                        row.getString("actor"),
                        row.getString("approver"),
                        row.getString("reason")));
    }

    // --- FR-RPT-01 · the dashboard -----------------------------------------

    @Override
    @Transactional(readOnly = true)
    public ReportView.Dashboard dashboard(List<UUID> visibleOutletIds, boolean mayViewProfit) {
        Instant now = clock.instant();
        // "Today" is the shop's day, not UTC's. A sale at 11pm in Accra belongs
        // to the day the shop was open, and at UTC+0 those agree — but writing
        // it as the server's date makes the assumption visible if that changes.
        Instant startOfDay = now.atZone(java.time.ZoneId.systemDefault())
                .toLocalDate().atStartOfDay(java.time.ZoneId.systemDefault()).toInstant();

        String sql = """
                select o.id::text as outlet_id, o.code, o.name,
                       -- Today's takings, net of today's returns. The card an
                       -- owner glances at has to be the money the shop kept.
                       coalesce(t.revenue, 0) - coalesce(back.refunded, 0) as revenue,
                       coalesce(t.receipts, 0) as receipts,
                       coalesce(t.cost, 0) - coalesce(back.restocked_cost, 0) as cost,
                       coalesce(low.count, 0)  as low_stock,
                       coalesce(sh.open_shifts, 0) as open_shifts,
                       coalesce(sh.expected_cash, 0) as expected_cash
                  from outlet o
                  left join lateral (
                       select sum(s.total) as revenue, count(*) as receipts,
                              sum((select sum(round(i.frozen_cost_price * i.quantity_base * 100))
                                     from sale_item i where i.sale_id = s.id)) as cost
                         from sale s
                        where s.outlet_id = o.id
                          and s.status = 'COMPLETED'
                          and s.created_at >= cast(:startOfDay as timestamptz)
                  ) t on true
                  left join lateral (
                       -- Restocked goods give their cost back; written-off ones
                       -- do not, because the shop still paid for them.
                       select sum(r.refund_total_pesewas) as refunded,
                              sum((select coalesce(sum(round(ri.frozen_cost_price
                                                             * ri.quantity_base * 100)), 0)
                                     from sale_return_item ri
                                    where ri.return_id = r.id
                                      and ri.disposition = 'RESTOCK')) as restocked_cost
                         from sale_return r
                        where r.outlet_id = o.id
                          and r.created_at >= cast(:startOfDay as timestamptz)
                  ) back on true
                  left join lateral (
                       select count(*) as count
                         from stock_level sl
                        where sl.outlet_id = o.id and sl.quantity <= sl.reorder_level
                  ) low on true
                  left join lateral (
                       select count(*) as open_shifts,
                              -- BR-14: float + cash taken + net movements, for
                              -- every shift still open at this branch.
                              sum(sh.opening_float
                                  + coalesce((select sum(p.amount) from payment p
                                               join sale s2 on s2.id = p.sale_id
                                              where s2.shift_id = sh.id
                                                and s2.status = 'COMPLETED'
                                                and p.method = 'cash'), 0)
                                  + coalesce((select sum(cm.amount) from cash_movement cm
                                              where cm.shift_id = sh.id), 0)) as expected_cash
                         from shift sh
                        where sh.outlet_id = o.id and sh.status = 'OPEN'
                  ) sh on true
                 where o.is_active = true
                   and o.id = any(cast(:outletIds as uuid[]))
                 order by o.name
                """;

        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("startOfDay", startOfDay.toString())
                .addValue("outletIds", visibleOutletIds.stream().map(UUID::toString)
                        .toArray(String[]::new));

        List<ReportView.DashboardOutlet> cards = jdbc.query(sql, parameters, (row, index) -> {
            BigDecimal revenue = major(row.getLong("revenue"));
            BigDecimal cost = major(row.getLong("cost"));
            return new ReportView.DashboardOutlet(
                    UUID.fromString(row.getString("outlet_id")),
                    row.getString("code"),
                    row.getString("name"),
                    revenue,
                    row.getLong("receipts"),
                    major(row.getLong("expected_cash")),
                    row.getLong("low_stock"),
                    row.getLong("open_shifts"),
                    mayViewProfit ? revenue.subtract(cost) : null);
        });

        return new ReportView.Dashboard(now, cards, combine(cards, mayViewProfit));
    }

    // --- internals ---------------------------------------------------------

    /**
     * FR-RPT-01: the combined line.
     *
     * <p>Summed from the same cards the caller was sent, so the total always
     * equals what is on the screen above it. A second query could disagree with
     * them by a sale that landed between the two.
     */
    private ReportView.DashboardOutlet combine(List<ReportView.DashboardOutlet> cards,
                                               boolean mayViewProfit) {
        BigDecimal revenue = BigDecimal.ZERO, cash = BigDecimal.ZERO, profit = BigDecimal.ZERO;
        long receipts = 0, low = 0, shifts = 0;

        for (ReportView.DashboardOutlet card : cards) {
            revenue = revenue.add(card.salesToday());
            cash = cash.add(card.expectedCash());
            receipts += card.receiptsToday();
            low += card.lowStockCount();
            shifts += card.openShifts();
            if (card.profitToday() != null) profit = profit.add(card.profitToday());
        }

        return new ReportView.DashboardOutlet(null, "ALL", "All branches",
                revenue, receipts, cash, low, shifts, mayViewProfit ? profit : null);
    }

    private List<ReportView.Row> lineRows(String sql, ReportFilter filter,
                                          boolean mayViewProfit, int limit) {
        return jdbc.query(sql, parameters(filter).addValue("limit", limit), (row, index) -> {
            BigDecimal revenue = major(row.getLong("revenue"));
            BigDecimal cost = major(row.getLong("cost"));
            return new ReportView.Row(
                    row.getString("key"), row.getString("name"), row.getString("secondary"),
                    row.getBigDecimal("quantity"), revenue,
                    mayViewProfit ? cost : null,
                    mayViewProfit ? revenue.subtract(cost) : null);
        });
    }

    private List<ReportView.Row> saleRows(String sql, ReportFilter filter,
                                          boolean mayViewProfit, int limit) {
        return jdbc.query(sql, parameters(filter).addValue("limit", limit), (row, index) -> {
            BigDecimal revenue = major(row.getLong("revenue"));
            BigDecimal cost = major(row.getLong("cost"));
            return new ReportView.Row(
                    row.getString("key"), row.getString("name"), row.getString("secondary"),
                    BigDecimal.valueOf(row.getLong("quantity")), revenue,
                    mayViewProfit ? cost : null,
                    mayViewProfit ? revenue.subtract(cost) : null);
        });
    }

    private List<ReportView.Row> paymentRows(ReportFilter filter, int limit) {
        String sql = """
                select pm.method as key, pm.method as name, null as secondary,
                       count(*) as quantity, sum(pm.amount) as revenue
                  from payment pm
                  join sale s on s.id = pm.sale_id
                 %s %s
                   and (cast(:paymentMethod as text) is null
                        or pm.method::text = cast(:paymentMethod as text))
                 group by pm.method
                 order by revenue desc
                 limit :limit
                """.formatted(SALE_SCOPE, COMPLETED);

        return jdbc.query(sql, parameters(filter).addValue("limit", limit), (row, index) ->
                new ReportView.Row(row.getString("key"), row.getString("name"), null,
                        BigDecimal.valueOf(row.getLong("quantity")),
                        major(row.getLong("revenue")), null, null));
    }

    private List<ReportView.Row> movementRows(ReportFilter filter, int limit) {
        String sql = """
                select m.type::text as key, m.type::text as name, null as secondary,
                       sum(abs(m.quantity_delta)) as quantity,
                       coalesce(sum(round(abs(m.quantity_delta) * coalesce(m.unit_cost, 0) * 100)), 0) as revenue
                  from inventory_movement m
                 where (cast(:from as timestamptz) is null or m.created_at >= cast(:from as timestamptz))
                   and (cast(:to   as timestamptz) is null or m.created_at <= cast(:to   as timestamptz))
                   and (cast(:outletId as uuid) is null or m.outlet_id = cast(:outletId as uuid))
                   and (cast(:userId   as uuid) is null or m.actor_id = cast(:userId as uuid))
                 group by m.type
                 order by quantity desc
                 limit :limit
                """;

        return jdbc.query(sql, parameters(filter).addValue("limit", limit), (row, index) ->
                new ReportView.Row(row.getString("key"),
                        row.getString("name").replace('_', ' '), null,
                        row.getBigDecimal("quantity"), major(row.getLong("revenue")), null, null));
    }

    private String categoryClause(ReportFilter filter) {
        return filter.category() == null ? ""
                : " and c.name = cast(:category as text) ";
    }

    private MapSqlParameterSource parameters(ReportFilter filter) {
        return new MapSqlParameterSource()
                .addValue("from", filter.from() == null ? null : filter.from().toString())
                .addValue("to", filter.to() == null ? null : filter.to().toString())
                .addValue("outletId", filter.outletId() == null ? null : filter.outletId().toString())
                .addValue("category", filter.category())
                .addValue("userId", filter.userId() == null ? null : filter.userId().toString())
                .addValue("paymentMethod", filter.paymentMethod());
    }

    /** BR-11: pesewas in the database, major units on a report. */
    private BigDecimal major(long pesewas) {
        return BigDecimal.valueOf(pesewas).movePointLeft(2).setScale(2, RoundingMode.HALF_UP);
    }

    private ReportView.Summary empty(boolean mayViewProfit) {
        BigDecimal zero = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        return new ReportView.Summary(0, zero, zero, zero, 0, zero, 0, zero, zero,
                mayViewProfit ? zero : null, mayViewProfit ? zero : null,
                mayViewProfit ? zero : null);
    }
}
