package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.ReceiptView;
import gh.giftedlabs.pos.dto.ReturnView;
import gh.giftedlabs.pos.dto.SaleView;
import gh.giftedlabs.pos.entity.BusinessSettings;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.repository.BusinessSettingsRepository;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.rules.EscPos;
import gh.giftedlabs.pos.rules.ReceiptLayout;
import gh.giftedlabs.pos.rules.ReceiptLogo;
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
    private final TerminalRepository terminals;
    private final BusinessSettingsRepository settings;
    private final Clock clock;

    public ReceiptServiceImpl(SaleService sales, gh.giftedlabs.pos.service.ReturnService returns,
                              OutletRepository outlets, TerminalRepository terminals,
                              BusinessSettingsRepository settings, Clock clock) {
        this.sales = sales;
        this.returns = returns;
        this.outlets = outlets;
        this.terminals = terminals;
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
                        saleTenderLabel(payment.method()), major(payment.amount()), payment.reference()))
                .toList();

        ReceiptLayout.Receipt receipt = new ReceiptLayout.Receipt(
                branding(outlet, profile, width),
                "Sales Receipt",
                sale.receiptNumber(),
                STAMP.format(sale.createdAt().atZone(ZoneId.systemDefault())),
                sale.cashierName(),
                terminalLabel(sale.terminalId()),
                sale.customerName(),
                voidNotice(sale),
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
                branding(outlet, profile, width),
                "EXCHANGE".equals(credit.kind()) ? "Exchange Note" : "Credit Note",
                credit.returnNumber(),
                STAMP.format(credit.createdAt().atZone(ZoneId.systemDefault())),
                credit.cashierName(),
                null,
                credit.customerName(),
                null,
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
                branding(outlet, profile, width),
                "Sales Receipt",
                "%s-01-000000".formatted(outlet == null ? "XXX" : outlet.getCode()),
                STAMP.format(clock.instant().atZone(ZoneId.systemDefault())),
                actor.username(),
                "TILL-01",
                "Sample Customer",
                null,
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
        // Two renderings of one layout: the text a preview shows, and the same
        // lines with their styles intact for the printer. Not two layouts — the
        // styled pass is the source, and the text is it with the emphasis
        // dropped, so a preview cannot show a section the roll does not have.
        return new ReceiptView(number, width.label(), width.columns(), reprint,
                ReceiptLayout.render(receipt, width),
                EscPos.encoded(ReceiptLayout.renderStyled(receipt, width)));
    }

    /**
     * The block at the top of the slip — FR-SET-01, FR-SET-02.
     *
     * <p>The business above the branch, because that is the order a customer
     * reads them in: whose shop, then which one. Where the two names are the
     * same — a single-branch business — only one is printed; the same word
     * twice in two sizes is noise.
     */
    private ReceiptLayout.Branding branding(Outlet outlet, BusinessSettings profile,
                                            ReceiptWidth width) {
        String company = companyName(profile);
        String shop = shopName(outlet, profile);
        if (present(company) && company.equalsIgnoreCase(shop)) shop = null;
        if (!present(company)) {
            // No business profile yet. The branch takes the top line rather than
            // the receipt opening with an address and no name at all.
            company = shop;
            shop = null;
        }

        return new ReceiptLayout.Branding(
                company,
                shop,
                addressLine(outlet, profile),
                phoneLine(outlet, profile),
                taxLine(profile),
                logo(profile, width));
    }

    /** The business, which owns the branches. */
    private String companyName(BusinessSettings profile) {
        if (profile == null) return null;
        if (present(profile.getTradingName())) return profile.getTradingName();
        return profile.getCompanyName();
    }

    /** The shop's own name where it has one — FR-SET-02. */
    private String shopName(Outlet outlet, BusinessSettings profile) {
        if (outlet == null) return null;
        String name = present(outlet.getTradingName()) ? outlet.getTradingName() : outlet.getName();
        if (!present(name)) return null;
        // The town, where it is not already in the name. Two branches of one
        // business are told apart by where they are, not by their code.
        return present(outlet.getTown()) && !name.toLowerCase(java.util.Locale.ROOT)
                .contains(outlet.getTown().toLowerCase(java.util.Locale.ROOT))
                ? "%s - %s".formatted(name, outlet.getTown())
                : name;
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

    /** The VAT registration, where the business has one. Nothing invented. */
    private String taxLine(BusinessSettings profile) {
        return profile == null || !present(profile.getTaxRegistrationNumber()) ? null
                : "VAT / TIN: " + profile.getTaxRegistrationNumber();
    }

    /**
     * The mark, scaled for this roll.
     *
     * <p>Converted per width because 58mm has two thirds of the dots: one bitmap
     * sized for the wide roll would run off the narrow one.
     */
    private ReceiptLayout.Logo logo(BusinessSettings profile, ReceiptWidth width) {
        return profile == null ? null
                : ReceiptLogo.from(profile.getLogoBytes(), width).orElse(null);
    }

    /**
     * Which till, as the counter names it.
     *
     * <p>The terminal's code, never its id. A customer asking about a sale is
     * pointed at "TILL-02", and nobody at a counter can match a UUID to a
     * machine.
     */
    private String terminalLabel(java.util.UUID terminalId) {
        if (terminalId == null) return null;
        return terminals.findById(terminalId)
                .map(Terminal::getCode)
                .filter(ReceiptServiceImpl::present)
                .map("TILL-%s"::formatted)
                .orElse(null);
    }

    /** The branch's own returns policy where it has one, else the business's. */
    private String footer(Outlet outlet, BusinessSettings profile) {
        if (outlet != null && present(outlet.getReceiptFooter())) return outlet.getReceiptFooter();
        return profile == null ? null : profile.getReceiptFooterPolicy();
    }

    /**
     * BR-3: what a voided slip says about itself.
     *
     * <p>The reason and who authorised it, because a reversal nobody can account
     * for is the thing the approval was for. Null on a live sale, which is the
     * only receipt that carries no notice.
     */
    private String voidNotice(SaleView sale) {
        if (!"VOIDED".equalsIgnoreCase(sale.status())) return null;
        String reason = present(sale.voidReason()) ? sale.voidReason() : "No reason recorded";
        return present(sale.voidedBy()) ? "%s (approved by %s)".formatted(reason, sale.voidedBy())
                : reason;
    }

    /** What a customer calls the tender, not what the database calls it. */
    private String saleTenderLabel(String method) {
        return "cash".equalsIgnoreCase(method) ? "Cash tendered" : tenderLabel(method);
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
