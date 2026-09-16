package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.ReportFilter;
import gh.giftedlabs.pos.dto.ReportView;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.ReportService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Reports — FR-RPT.
 *
 * <p>{@code report.view} opens the door; {@code report.view_profit} decides
 * whether cost and profit are computed at all. FR-RPT-05 is enforced by not
 * sending the numbers, not by asking the screen to hide them.
 *
 * <p>The dashboard is the exception to {@code report.view}: a cashier's
 * dashboard is their own shift and their own till, which is operational
 * information rather than a report (FR-RPT-02).
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService reports;
    private final UserRepository users;
    private final OutletRepository outlets;

    public ReportController(ReportService reports, UserRepository users, OutletRepository outlets) {
        this.reports = reports;
        this.users = users;
        this.outlets = outlets;
    }

    /** FR-RPT-04 sales summary. */
    @GetMapping("/summary")
    @PreAuthorize("hasAuthority('" + Permission.Codes.REPORT_VIEW + "')")
    public ReportView.Summary summary(@RequestParam(required = false) Instant from,
                                      @RequestParam(required = false) Instant to,
                                      @RequestParam(required = false) UUID outletId,
                                      @RequestParam(required = false) String category,
                                      @RequestParam(required = false) UUID userId,
                                      @RequestParam(required = false) String paymentMethod,
                                      Authentication authentication) {
        return reports.summary(
                new ReportFilter(from, to, outletId, category, userId, paymentMethod),
                mayViewProfit(authentication));
    }

    /**
     * The profit and loss statement.
     *
     * <p>{@code report.view_pl} rather than {@code report.view_profit}. Gross
     * profit tells a manager whether the shop is buying and selling well; net
     * profit exposes the whole cost base — the rent, what the staff are paid —
     * which is the owner's business and not automatically a manager's.
     */
    @GetMapping("/profit-and-loss")
    @PreAuthorize("hasAuthority('" + Permission.Codes.REPORT_VIEW_PL + "')")
    public ReportView.ProfitAndLoss profitAndLoss(@RequestParam(required = false) Instant from,
                                                  @RequestParam(required = false) Instant to,
                                                  @RequestParam(required = false) UUID outletId) {
        return reports.profitAndLoss(ReportFilter.of(from, to, outletId));
    }

    /** FR-RPT-04: by product, category, cashier, customer, payment or movement. */
    @GetMapping("/breakdown")
    @PreAuthorize("hasAuthority('" + Permission.Codes.REPORT_VIEW + "')")
    public List<ReportView.Row> breakdown(@RequestParam String by,
                                          @RequestParam(required = false) Instant from,
                                          @RequestParam(required = false) Instant to,
                                          @RequestParam(required = false) UUID outletId,
                                          @RequestParam(required = false) String category,
                                          @RequestParam(required = false) UUID userId,
                                          @RequestParam(required = false) String paymentMethod,
                                          @RequestParam(defaultValue = "200") int limit,
                                          Authentication authentication) {
        return reports.breakdown(parse(ReportService.Grouping.class, by, "grouping"),
                new ReportFilter(from, to, outletId, category, userId, paymentMethod),
                mayViewProfit(authentication), Math.clamp(limit, 1, 1000));
    }

    /** FR-RPT-04 best sellers and slow movers. */
    @GetMapping("/ranking")
    @PreAuthorize("hasAuthority('" + Permission.Codes.REPORT_VIEW + "')")
    public List<ReportView.Row> ranking(@RequestParam String direction,
                                        @RequestParam(required = false) Instant from,
                                        @RequestParam(required = false) Instant to,
                                        @RequestParam(required = false) UUID outletId,
                                        @RequestParam(required = false) String category,
                                        @RequestParam(defaultValue = "20") int limit,
                                        Authentication authentication) {
        return reports.ranking(parse(ReportService.Ranking.class, direction, "direction"),
                new ReportFilter(from, to, outletId, category, null, null),
                mayViewProfit(authentication), Math.clamp(limit, 1, 200));
    }

    /**
     * FR-RPT-04: the dashboard chart's series.
     *
     * <p>Open to any signed-in user, like the dashboard it draws on: takings
     * and purchases over time are what a manager's screen is for, and it
     * carries no cost figure to guard.
     */
    @GetMapping("/series")
    @PreAuthorize("isAuthenticated()")
    public List<ReportView.SeriesPoint> series(@RequestParam(defaultValue = "DAY") String bucket,
                                               @RequestParam(required = false) Instant from,
                                               @RequestParam(required = false) Instant to,
                                               @RequestParam(required = false) UUID outletId) {
        return reports.series(parse(ReportService.Bucket.class, bucket, "bucket"),
                ReportFilter.of(from, to, outletId));
    }

    /** FR-RPT-04 stock on hand, inventory valuation, low stock. */
    @GetMapping("/stock")
    @PreAuthorize("hasAuthority('" + Permission.Codes.REPORT_VIEW + "')")
    public List<ReportView.StockRow> stock(@RequestParam(defaultValue = "ON_HAND") String view,
                                           @RequestParam(required = false) UUID outletId,
                                           @RequestParam(required = false) String category,
                                           @RequestParam(defaultValue = "500") int limit,
                                           Authentication authentication) {
        return reports.stock(parse(ReportService.StockView.class, view, "view"),
                new ReportFilter(null, null, outletId, category, null, null),
                mayViewProfit(authentication), Math.clamp(limit, 1, 2000));
    }

    /** FR-RPT-04 discount and override log, void log. */
    @GetMapping("/exceptions")
    @PreAuthorize("hasAuthority('" + Permission.Codes.REPORT_VIEW + "')")
    public List<ReportView.ExceptionRow> exceptions(@RequestParam String log,
                                                    @RequestParam(required = false) Instant from,
                                                    @RequestParam(required = false) Instant to,
                                                    @RequestParam(required = false) UUID outletId,
                                                    @RequestParam(defaultValue = "200") int limit) {
        return reports.exceptions(parse(ReportService.ExceptionLog.class, log, "log"),
                ReportFilter.of(from, to, outletId), Math.clamp(limit, 1, 1000));
    }

    /**
     * FR-RPT-01 · FR-RPT-02: the dashboard, scoped to the branches this person
     * is assigned to.
     *
     * <p>Scoped here rather than by a query parameter. A manager asking for
     * another branch's figures should not get them because they changed a URL.
     */
    @GetMapping("/dashboard")
    @PreAuthorize("isAuthenticated()")
    public ReportView.Dashboard dashboard(@AuthenticationPrincipal PosPrincipal actor,
                                          Authentication authentication) {
        boolean mayViewAll = has(authentication, Permission.Codes.OUTLET_VIEW_ALL);
        List<UUID> visible = mayViewAll
                ? outlets.findAll().stream().map(o -> o.getId()).toList()
                : users.findById(actor.userId()).map(User::getOutletIds).map(List::copyOf).orElse(List.of());

        return reports.dashboard(visible, mayViewProfit(authentication));
    }

    private boolean mayViewProfit(Authentication authentication) {
        return has(authentication, Permission.Codes.REPORT_VIEW_PROFIT);
    }

    private boolean has(Authentication authentication, String code) {
        return authentication != null && authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority).anyMatch(code::equals);
    }

    private <E extends Enum<E>> E parse(Class<E> type, String value, String what) {
        try {
            return Enum.valueOf(type, value.trim().toUpperCase().replace('-', '_'));
        } catch (IllegalArgumentException | NullPointerException unknown) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown " + what + ": " + value);
        }
    }
}
