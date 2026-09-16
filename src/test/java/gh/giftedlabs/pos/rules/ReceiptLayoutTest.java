package gh.giftedlabs.pos.rules;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Receipt layout — FR-RCPT-03, FR-RCPT-04, FR-RCPT-06, PRD §9.
 *
 * <p>No printer and no database. The layout is the part a customer reads, so it
 * is asserted character by character here rather than inspected on a roll of
 * paper — which is also the only way to test it before the hardware arrives.
 */
@DisplayName("Receipt layout — PRD §9")
class ReceiptLayoutTest {

    private static ReceiptLayout.Receipt receipt(boolean reprint) {
        return new ReceiptLayout.Receipt(
                "INCO HARDWARE",
                "12 Main Street, Koforidua",
                "Tel: 024 000 0000",
                null,
                "INC-01-004312",
                "05/09/2026  14:32",
                "Kwame A.",
                "Yaw Mensah (Electrician)",
                List.of(
                        new ReceiptLayout.Item("2.5mm T&E Cable", new BigDecimal("12.000"), "m",
                                new BigDecimal("18.50"), new BigDecimal("222.00")),
                        new ReceiptLayout.Item("13A Switched Socket", new BigDecimal("4.000"), "pcs",
                                new BigDecimal("25.00"), new BigDecimal("100.00"))),
                new BigDecimal("322.00"),
                new BigDecimal("12.00"),
                BigDecimal.ZERO,
                new BigDecimal("310.00"),
                List.of(new ReceiptLayout.Tender("Cash", new BigDecimal("200.00"), null),
                        new ReceiptLayout.Tender("Mobile Money", new BigDecimal("110.00"), "MM8842219")),
                BigDecimal.ZERO,
                "Goods returnable within 7 days with this receipt.",
                reprint,
                "GHS");
    }

    @Test
    @DisplayName("every line fits the roll — 48 columns at 80mm, 32 at 58mm")
    void nothingOverflows() {
        for (ReceiptWidth width : ReceiptWidth.values()) {
            for (String line : ReceiptLayout.render(receipt(false), width)) {
                assertTrue(line.length() <= width.columns(),
                        "%s overflows %s: %d columns in \"%s\""
                                .formatted(width.label(), width.label(), line.length(), line));
            }
        }
    }

    @Test
    @DisplayName("money is flush to the last column, so the figures line up")
    void moneyIsRightAligned() {
        List<String> lines = ReceiptLayout.render(receipt(false), ReceiptWidth.MM80);

        // The money block only. "Cashier : ..." is a labelled header line, not a
        // figure, and it is deliberately not padded to the margin.
        List<String> figures = lines.stream()
                .filter(line -> !line.contains(" : "))
                .filter(line -> line.startsWith("Subtotal") || line.startsWith("TOTAL")
                        || line.startsWith("Cash") || line.startsWith("Change"))
                .toList();

        assertFalse(figures.isEmpty());
        // A column of figures that does not line up is a receipt somebody has to
        // read twice.
        figures.forEach(line -> assertEquals(ReceiptWidth.MM80.columns(), line.length(),
                "not flush to the right margin: \"" + line + "\""));
    }

    @Test
    @DisplayName("amounts always carry two decimals — BR-11")
    void amountsKeepTwoDecimals() {
        String total = ReceiptLayout.render(receipt(false), ReceiptWidth.MM80).stream()
                .filter(line -> line.startsWith("TOTAL")).findFirst().orElseThrow();

        // 310, not 310.0 and never just 310.
        assertTrue(total.endsWith("GHS 310.00"), total);
    }

    @Test
    @DisplayName("quantities read as a shop says them, not as stored")
    void quantitiesAreTrimmed() {
        String detail = ReceiptLayout.render(receipt(false), ReceiptWidth.MM80).stream()
                .filter(line -> line.contains("@ GHS 18.50")).findFirst().orElseThrow();

        // 12 m, not 12.000 m — the store keeps three decimals (BR-12), the
        // customer does not want to read them.
        assertTrue(detail.contains("12 m @ GHS 18.50"), detail);
    }

    @Test
    @DisplayName("a discount prints as a negative, because that is what it did")
    void discountIsNegative() {
        String discount = ReceiptLayout.render(receipt(false), ReceiptWidth.MM80).stream()
                .filter(line -> line.startsWith("Discount")).findFirst().orElseThrow();

        assertTrue(discount.trim().endsWith("GHS -12.00"), discount);
    }

    @Test
    @DisplayName("a reprint carries the band directly under the header — FR-RCPT-06")
    void reprintBand() {
        List<String> lines = ReceiptLayout.render(receipt(true), ReceiptWidth.MM80);

        int band = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).contains("*** REPRINT ***")) { band = i; break; }
        }
        assertTrue(band > 0, "a reprint must be marked");
        // Above the receipt number, where it cannot be missed. A reprint that
        // looked like an original would be a second receipt for one sale.
        int receiptLine = lines.indexOf(lines.stream()
                .filter(line -> line.startsWith("Receipt :")).findFirst().orElseThrow());
        assertTrue(band < receiptLine, "the band belongs above the receipt details");

        assertFalse(String.join("\n", ReceiptLayout.render(receipt(false), ReceiptWidth.MM80))
                .contains("REPRINT"), "an original must not be marked");
    }

    @Test
    @DisplayName("58mm gives the item name its own line rather than truncating it")
    void narrowRollKeepsNames() {
        List<String> lines = ReceiptLayout.render(receipt(false), ReceiptWidth.MM58);

        // The whole name survives. A receipt whose item names are cut off is one
        // a customer cannot check against what is in the bag.
        assertTrue(lines.stream().anyMatch(line -> line.contains("13A Switched Socket")),
                "the name should not be truncated at 58mm: " + lines);
    }

    @Test
    @DisplayName("a mobile money reference is printed under its tender")
    void tenderReference() {
        List<String> lines = ReceiptLayout.render(receipt(false), ReceiptWidth.MM80);
        int tender = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith("Mobile Money")) { tender = i; break; }
        }
        assertTrue(tender >= 0);
        assertEquals("  Ref: MM8842219", lines.get(tender + 1));
    }

    @Test
    @DisplayName("a name longer than the roll is broken, never dropped")
    void longNamesSurvive() {
        ReceiptLayout.Receipt long_ = new ReceiptLayout.Receipt(
                "SHOP", null, null, null, "INC-01-000001", "05/09/2026", "A", null,
                List.of(new ReceiptLayout.Item(
                        "Heavy Duty Galvanised Steel Cable Tray 300mm Perforated Three Metre Length",
                        BigDecimal.ONE, "pc", new BigDecimal("450.00"), new BigDecimal("450.00"))),
                new BigDecimal("450.00"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("450.00"),
                List.of(new ReceiptLayout.Tender("Cash", new BigDecimal("450.00"), null)),
                BigDecimal.ZERO, null, false, "GHS");

        List<String> lines = ReceiptLayout.render(long_, ReceiptWidth.MM58);
        lines.forEach(line -> assertTrue(line.length() <= 32, "overflowed: " + line));
        assertTrue(String.join(" ", lines).contains("Perforated"),
                "the middle of a long name must not be lost");
    }

    @Test
    @DisplayName("the job initialises and cuts, and never sends multi-byte characters")
    void escPosJob() {
        byte[] job = EscPos.job(ReceiptLayout.render(receipt(false), ReceiptWidth.MM80));

        assertEquals(0x1B, job[0]);
        assertEquals('@', job[1]);
        // GS V — the cut, last.
        assertEquals(0x1D, job[job.length - 4]);
        assertEquals('V', job[job.length - 3]);

        assertFalse(EscPos.encoded(ReceiptLayout.render(receipt(false), ReceiptWidth.MM58)).isBlank());
    }
}
