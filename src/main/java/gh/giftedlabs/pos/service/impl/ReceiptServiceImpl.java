package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.ReceiptView;
import gh.giftedlabs.pos.dto.ReturnView;
import gh.giftedlabs.pos.dto.SaleView;
import gh.giftedlabs.pos.entity.BusinessSettings;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.repository.BusinessSettingsRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.rules.EscPos;
import gh.giftedlabs.pos.rules.ReceiptLayout;
import gh.giftedlabs.pos.rules.ReceiptWidth;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.ReceiptService;
import gh.giftedlabs.pos.service.SaleService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/**
 * FR-RCPT-04: the receipt, from the sale as recorded.
 *
 * <p>Built here rather than in the browser for two reasons. A receipt assembled
 * client-side states what the till believed at the time, not what the server
 * stored; and a reprint assembled the same way could differ from the original,
 * which is the one thing a reprint must never do.
 *
 * <p>The header comes from the outlet where it can — the trading name, address
 * and phone of the shop that made the sale — and falls back to the business
 * profile. Two shops under one owner print their own names (FR-SET-02), which is
 * the whole point of the per-outlet fields.
 */
@Service
public class ReceiptServiceImpl implements ReceiptService {

    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("dd/MM/yyyy  HH:mm");

    private final SaleService sales;
    private final gh.giftedlabs.pos.service.ReturnService returns;
    private final OutletRepository outlets;
    private final BusinessSettingsRepository settings;
    private final Clock clock;

    public ReceiptServiceImpl(SaleService sales, gh.giftedlabs.pos.service.ReturnService returns,
                              OutletRepository outlets,
                              BusinessSettingsRepository settings, Clock clock) {
        this.sales = sales;
        this.returns = returns;
        this.outlets = outlets;
        this.settings = settings;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public ReceiptView render(UUID saleId, ReceiptWidth width, boolean reprint) {
        SaleView sale = sales.get(saleId);
        Outlet outlet = outlets.findById(sale.outletId()).orElse(null);
        BusinessSettings profile = settings.findById((short) 1).orElse(null);

        List<ReceiptLayout.Item> items = sale.items().stream()
                .map(line -> new ReceiptLayout.Item(
                        line.productName(),
                        line.quantity(),
                        line.selectedUnit(),
                        line.unitPrice(),
                        major(line.lineTotal())))
                .toList();

        List<ReceiptLayout.Tender> tenders = sale.payments().stream()
                .map(payment -> new ReceiptLayout.Tender(
                        tenderLabel(payment.method()), major(payment.amount()), payment.reference()))
                .toList();

        ReceiptLayout.Receipt receipt = new ReceiptLayout.Receipt(
                shopName(outlet, profile),
                addressLine(outlet, profile),
                phoneLine(outlet, profile),
                null,
                sale.receiptNumber(),
                STAMP.format(sale.createdAt().atZone(ZoneId.systemDefault())),
                sale.cashierName(),
                sale.customerName(),
                items,
                major(sale.subtotal()),
                major(sale.discountTotal()),
                BigDecimal.ZERO,
                major(sale.total()),
                tenders,
                major(sale.changeDue()),
                footer(outlet, profile),
                reprint,
                currency(profile));

        return view(receipt, width, sale.receiptNumber(), reprint);
    }

    /**
     * The credit note — the same document, a different title.
     *
     * <p>Amounts are shown as the customer experiences them: positive figures for
     * what came back and what they were given. A slip full of negative numbers is
     * arithmetically tidy and unreadable at a counter.
     */
    @Override
    @Transactional(readOnly = true)
    public ReceiptView renderReturn(UUID returnId, ReceiptWidth width, boolean reprint) {
        ReturnView credit = returns.get(returnId);
        Outlet outlet = outlets.findById(credit.outletId()).orElse(null);
        BusinessSettings profile = settings.findById(BusinessSettings.SINGLETON_ID).orElse(null);

        List<ReceiptLayout.Item> items = credit.items().stream()
                .map(line -> new ReceiptLayout.Item(
                        // The disposition is on the slip: a customer who was
                        // refunded for a faulty item and one whose goods went
                        // back on the shelf hold different documents.
                        "%s (%s)".formatted(line.productName(), line.dispositionLabel()),
                        line.quantityBase(), "", line.unitPrice(),
                        major(line.lineRefundPesewas())))
                .toList();

        BigDecimal refunded = major(credit.refundTotalPesewas());
        List<ReceiptLayout.Tender> tenders = new java.util.ArrayList<>();
        if (credit.refundMethod() != null) {
            tenders.add(new ReceiptLayout.Tender(
                    "Refunded by " + tenderLabel(credit.refundMethod().toLowerCase()),
                    refunded, null));
        }
        if (credit.exchangeReceiptNumber() != null) {
            // The swap's own receipt, named so the two slips can be put together.
            tenders.add(new ReceiptLayout.Tender(
                    "Exchanged on", BigDecimal.ZERO, credit.exchangeReceiptNumber()));
        }

        ReceiptLayout.Receipt note = new ReceiptLayout.Receipt(
                shopName(outlet, profile),
                addressLine(outlet, profile),
                phoneLine(outlet, profile),
                "EXCHANGE".equals(credit.kind()) ? "Exchange Note" : "Credit Note",
                credit.returnNumber(),
                STAMP.format(credit.createdAt().atZone(ZoneId.systemDefault())),
                credit.cashierName(),
                credit.customerName(),
                items,
                refunded, BigDecimal.ZERO, BigDecimal.ZERO, refunded,
                tenders,
                BigDecimal.ZERO,
                "Against receipt %s. Keep this slip."
                        .formatted(credit.originalReceiptNumber()),
                reprint,
                currency(profile));

        return view(note, width, credit.returnNumber(), reprint);
    }

    /**
     * FR-RCPT-09 · `K-05`: what the roll will look like, before anything is sold.
     *
     * <p>Rendered through the same layout as a real receipt rather than a mock-up,
     * so a shop choosing a paper width sees the actual result. A preview drawn
     * separately would eventually disagree with what prints.
     */
    @Override
    @Transactional(readOnly = true)
    public ReceiptView preview(ReceiptWidth width, PosPrincipal actor) {
        Outlet outlet = actor.outletId() == null ? null
                : outlets.findById(actor.outletId()).orElse(null);
        BusinessSettings profile = settings.findById((short) 1).orElse(null);

        ReceiptLayout.Receipt sample = new ReceiptLayout.Receipt(
                shopName(outlet, profile),
                addressLine(outlet, profile),
                phoneLine(outlet, profile),
                null,
                "%s-01-000000".formatted(outlet == null ? "XXX" : outlet.getCode()),
                STAMP.format(clock.instant().atZone(ZoneId.systemDefault())),
                actor.username(),
                "Sample Customer",
                List.of(
                        new ReceiptLayout.Item("2.5mm Twin & Earth Cable", new BigDecimal("12.000"),
                                "m", new BigDecimal("18.50"), new BigDecimal("222.00")),
                        new ReceiptLayout.Item("13A Switched Socket", new BigDecimal("4.000"),
                                "pcs", new BigDecimal("25.00"), new BigDecimal("100.00"))),
                new BigDecimal("322.00"), new BigDecimal("12.00"), BigDecimal.ZERO,
                new BigDecimal("310.00"),
                List.of(new ReceiptLayout.Tender("Cash", new BigDecimal("310.00"), null)),
                BigDecimal.ZERO,
                footer(outlet, profile),
                false,
                currency(profile));

        return view(sample, width, "PREVIEW", false);
    }

    // --- internals ---------------------------------------------------------

    private ReceiptView view(ReceiptLayout.Receipt receipt, ReceiptWidth width,
                             String number, boolean reprint) {
        List<String> lines = ReceiptLayout.render(receipt, width);
        return new ReceiptView(number, width.label(), width.columns(), reprint,
                lines, EscPos.encoded(lines));
    }

    /** The shop's own name where it has one — FR-SET-02. */
    private String shopName(Outlet outlet, BusinessSettings profile) {
        if (outlet != null && present(outlet.getTradingName())) return outlet.getTradingName();
        if (outlet != null && present(outlet.getName())) return outlet.getName();
        if (profile != null && present(profile.getTradingName())) return profile.getTradingName();
        if (profile != null && present(profile.getCompanyName())) return profile.getCompanyName();
        return "";
    }

    private String addressLine(Outlet outlet, BusinessSettings profile) {
        if (outlet != null && present(outlet.getAddress())) return outlet.getAddress();
        return profile == null ? null : profile.getAddress();
    }

    private String phoneLine(Outlet outlet, BusinessSettings profile) {
        String phone = outlet != null && present(outlet.getPhone())
                ? outlet.getPhone()
                : profile == null ? null : profile.getPhone();
        return present(phone) ? "Tel: " + phone : null;
    }

    /** The branch's own returns policy where it has one, else the business's. */
    private String footer(Outlet outlet, BusinessSettings profile) {
        if (outlet != null && present(outlet.getReceiptFooter())) return outlet.getReceiptFooter();
        return profile == null ? null : profile.getReceiptFooterPolicy();
    }

    /** What a customer calls the tender, not what the database calls it. */
    private String tenderLabel(String method) {
        return switch (method == null ? "" : method.toLowerCase()) {
            case "cash" -> "Cash";
            case "card" -> "Card";
            case "momo" -> "Mobile Money";
            case "transfer" -> "Bank Transfer";
            default -> method == null ? "Payment" : method;
        };
    }

    /**
     * An ASCII currency for the roll.
     *
     * <p>The shop's symbol is GH₵ and code page 437 cannot render it — it prints
     * as rubbish. The currency *code* is ASCII by definition, so that is what
     * goes on paper while the screen keeps the symbol.
     */
    private String currency(BusinessSettings profile) {
        return profile == null || !present(profile.getCurrencyCode()) ? "GHS"
                : profile.getCurrencyCode();
    }

    /** BR-11: pesewas stored, major units printed. */
    private BigDecimal major(long pesewas) {
        return BigDecimal.valueOf(pesewas).movePointLeft(2)
                .setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static boolean present(String value) {
        return value != null && !value.isBlank();
    }
}
