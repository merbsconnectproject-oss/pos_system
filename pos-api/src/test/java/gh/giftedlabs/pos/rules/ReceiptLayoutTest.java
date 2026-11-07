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

    private static final ReceiptLayout.Branding BRANDING = new ReceiptLayout.Branding(
            "Radiance Electricals",
            "Inco Hardware - Koforidua",
            "12 Main Street, Koforidua",
            "Tel: 024 000 0000",
            "VAT / TIN: C0012345678",
            null);

    private static ReceiptLayout.Receipt receipt(boolean reprint) {
        return new ReceiptLayout.Receipt(
                BRANDING,
                "Sales Receipt",
                "INC-01-004312",
                "05/09/2026  14:32",
                "Kwame A.",
                "TILL-01",
                "Yaw Mensah (Electrician)",
                null,
                List.of(
                        new ReceiptLayout.Item("2.5mm T&E Cable", new BigDecimal("12.000"), "m",
                                new BigDecimal("18.50"), new BigDecimal("222.00")),
                        new ReceiptLayout.Item("13A Switched Socket", new BigDecimal("4.000"), "pcs",
                                new BigDecimal("25.00"), new BigDecimal("100.00"))),
                new BigDecimal("322.00"),
                new BigDecimal("12.00"),
                BigDecimal.ZERO,
                new BigDecimal("310.00"),
                List.of(new ReceiptLayout.Tender("Cash tendered", new BigDecimal("220.00"), null),
                        new ReceiptLayout.Tender("Mobile Money", new BigDecimal("110.00"), "MM8842219")),
                new BigDecimal("20.00"),
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
    @DisplayName("cash overpayment prints both the amount received and the change due")
    void cashOverpaymentIsExplicit() {
        List<String> lines = ReceiptLayout.render(receipt(false), ReceiptWidth.MM80);

        assertTrue(lines.stream().anyMatch(line -> line.startsWith("Cash tendered")
                && line.endsWith("GHS 220.00")), String.join("\n", lines));
        assertTrue(lines.stream().anyMatch(line -> line.startsWith("Change due")
                && line.endsWith("GHS 20.00")), String.join("\n", lines));
    }

    @Test
    @DisplayName("a name longer than the roll is broken, never dropped")
    void longNamesSurvive() {
        ReceiptLayout.Receipt long_ = new ReceiptLayout.Receipt(
                new ReceiptLayout.Branding("SHOP", null, null, null, null, null),
                null, "INC-01-000001", "05/09/2026", "A", null, null, null,
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
    @DisplayName("the header names the shop before it says anything about the sale")
    void headerComesFirst() {
        List<String> lines = ReceiptLayout.render(receipt(false), ReceiptWidth.MM80);

        // Whose shop, which branch, where, and the number to ring — in that
        // order, above the receipt number. A slip that opens with a receipt
        // number is one a customer cannot place.
        int company = indexOfContaining(lines, "Radiance Electricals");
        int outlet = indexOfContaining(lines, "Inco Hardware - Koforidua");
        int address = indexOfContaining(lines, "12 Main Street");
        int phone = indexOfContaining(lines, "Tel: 024 000 0000");
        int number = indexOfContaining(lines, "Receipt : INC-01-004312");

        assertTrue(company >= 0 && outlet > company && address > outlet && phone > address,
                String.join("\n", lines));
        assertTrue(phone < number, "the header belongs above the transaction");
    }

    @Test
    @DisplayName("a logo is printed but has no text, so a text preview skips it")
    void logoPrintsWithoutText() {
        ReceiptLayout.Logo mark = new ReceiptLayout.Logo(8, 2, new byte[] {(byte) 0xFF, 0x18});
        ReceiptLayout.Receipt withLogo = new ReceiptLayout.Receipt(
                new ReceiptLayout.Branding("Radiance Electricals", null, null, null, null, mark),
                null, "INC-01-000001", "05/09/2026", "A", null, null, null,
                List.of(new ReceiptLayout.Item("Clip", BigDecimal.ONE, "pc",
                        new BigDecimal("3.00"), new BigDecimal("3.00"))),
                new BigDecimal("3.00"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("3.00"),
                List.of(new ReceiptLayout.Tender("Cash", new BigDecimal("3.00"), null)),
                BigDecimal.ZERO, null, false, "GHS");

        assertEquals(ReceiptLayout.Style.LOGO,
                ReceiptLayout.renderStyled(withLogo, ReceiptWidth.MM80).get(0).style(),
                "the mark goes above everything");
        // Nothing blank is left behind in the text where the bitmap was.
        assertFalse(ReceiptLayout.render(withLogo, ReceiptWidth.MM80).get(0).isBlank());

        // And the bytes actually carry the raster command — GS v 0.
        byte[] job = EscPos.job(ReceiptLayout.renderStyled(withLogo, ReceiptWidth.MM80));
        assertTrue(contains(job, new byte[] {0x1D, 'v', '0'}), "the logo must reach the printer");
    }

    @Test
    @DisplayName("the receipt number is barcoded at the foot, and readable under the bars")
    void barcodeClosesTheSlip() {
        List<ReceiptLayout.Line> styled =
                ReceiptLayout.renderStyled(receipt(false), ReceiptWidth.MM80);

        ReceiptLayout.Line last = styled.get(styled.size() - 1);
        assertEquals(ReceiptLayout.Style.BARCODE, last.style(), "a scanner looks at the bottom");
        assertEquals("INC-01-004312", last.data());
        // Printed under the bars too: a smudged barcode still has to be keyable.
        assertTrue(last.text().contains("INC-01-004312"), last.text());

        // GS k 73 — Code 128, opened with the subset selector.
        byte[] job = EscPos.job(styled);
        assertTrue(contains(job, new byte[] {0x1D, 'k', 73}), "the bars must reach the printer");
        assertTrue(contains(job, "{BINC-01-004312".getBytes(java.nio.charset.StandardCharsets.US_ASCII)),
                "Code 128 subset B carries letters as well as digits");
    }

    @Test
    @DisplayName("emphasis is always turned off again on the line that turned it on")
    void emphasisNeverLeaks() {
        byte[] job = EscPos.job(ReceiptLayout.renderStyled(receipt(true), ReceiptWidth.MM80));

        // A printer keeps what it was last told. One line that forgets to reset
        // would embolden — or invert — the whole rest of the roll.
        assertEquals(count(job, new byte[] {0x1B, 'E', 1}), count(job, new byte[] {0x1B, 'E', 0}),
                "bold on and bold off must balance");
        assertEquals(count(job, new byte[] {0x1D, 'B', 1}), count(job, new byte[] {0x1D, 'B', 0}),
                "inverted text must be turned back off");
    }

    private static int indexOfContaining(List<String> lines, String fragment) {
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).contains(fragment)) return i;
        }
        return -1;
    }

    private static boolean contains(byte[] haystack, byte[] needle) {
        return count(haystack, needle) > 0;
    }

    private static int count(byte[] haystack, byte[] needle) {
        int found = 0;
        for (int i = 0; i + needle.length <= haystack.length; i++) {
            boolean match = true;
            for (int j = 0; j < needle.length && match; j++) {
                match = haystack[i + j] == needle[j];
            }
            if (match) found++;
        }
        return found;
    }

    @Test
    @DisplayName("the job initialises and cuts, and never sends multi-byte characters")
    void escPosJob() {
        byte[] job = EscPos.job(ReceiptLayout.renderStyled(receipt(false), ReceiptWidth.MM80));

        assertEquals(0x1B, job[0]);
        assertEquals('@', job[1]);
        // GS V — the cut, last.
        assertEquals(0x1D, job[job.length - 4]);
        assertEquals('V', job[job.length - 3]);

        assertFalse(EscPos.encoded(
                ReceiptLayout.renderStyled(receipt(false), ReceiptWidth.MM58)).isBlank());
    }
}
