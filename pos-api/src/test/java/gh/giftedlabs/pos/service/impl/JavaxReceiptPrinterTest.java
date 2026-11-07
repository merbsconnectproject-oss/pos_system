package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.exception.PrinterException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import javax.print.Doc;
import javax.print.DocFlavor;
import javax.print.DocPrintJob;
import javax.print.PrintService;
import javax.print.attribute.PrintRequestAttributeSet;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@DisplayName("In-process receipt printer")
class JavaxReceiptPrinterTest {

    private static final String RECEIPT = "RAD-01-000123";
    private static final String PAYLOAD =
            Base64.getEncoder().encodeToString(new byte[] {0x1B, '@', 'O', 'K', '\n'});

    @Test
    @DisplayName("FR-RCPT-02 · sends decoded ESC/POS bytes to the configured queue")
    void printsToConfiguredQueue() throws Exception {
        PrintService printer = queue("POS-80");
        DocPrintJob job = printer.createPrintJob();

        JavaxReceiptPrinter subject = new JavaxReceiptPrinter("pos-80", lookup(null, printer));

        assertEquals("POS-80", subject.print(RECEIPT, PAYLOAD));
        verify(job).print(any(Doc.class), any(PrintRequestAttributeSet.class));
    }

    @Test
    @DisplayName("FR-RCPT-02 · malformed data never reaches the printer")
    void malformedPayloadIsRefused() {
        JavaxReceiptPrinter subject = new JavaxReceiptPrinter("POS-80", lookup(null));

        PrinterException failure = assertThrows(PrinterException.class,
                () -> subject.print(RECEIPT, "not base64!"));

        assertEquals("INVALID_PRINT_PAYLOAD", failure.getCode());
    }

    @Test
    @DisplayName("FR-RCPT-05 · a counter with no printer installed is reported for retry")
    void noPrinterIsReported() {
        JavaxReceiptPrinter subject = new JavaxReceiptPrinter("POS-80", lookup(null));

        PrinterException failure = assertThrows(PrinterException.class,
                () -> subject.print(RECEIPT, PAYLOAD));

        assertEquals("PRINTER_NOT_FOUND", failure.getCode());
    }

    @Nested
    @DisplayName("FR-RCPT-02 · the configured name is a hint, not a requirement")
    class Detection {

        @Test
        @DisplayName("a driver that registered itself under its own brand still prints")
        void vendorNamedQueueIsFound() {
            // The bug this covers: the shipped default said POS-80, the XPrinter
            // driver named its queue XPrinter, and the counter could not print.
            JavaxReceiptPrinter subject = new JavaxReceiptPrinter("POS-80", lookup(null, queue("XPrinter")));

            assertEquals("XPrinter", subject.print(RECEIPT, PAYLOAD));
        }

        @Test
        @DisplayName("a model-numbered queue is recognised next to an office printer")
        void modelNumberedQueueWinsOverOfficePrinter() {
            PrintService office = queue("HP LaserJet Pro M404");
            JavaxReceiptPrinter subject = new JavaxReceiptPrinter(
                    "POS-80", lookup(office, office, queue("XP-80C")));

            assertEquals("XP-80C", subject.print(RECEIPT, PAYLOAD));
        }

        @Test
        @DisplayName("the stock Windows RAW driver counts as a receipt printer")
        void genericTextOnlyIsRecognised() {
            JavaxReceiptPrinter subject = new JavaxReceiptPrinter(
                    "", lookup(null, queue("Generic / Text Only")));

            assertEquals("Generic / Text Only", subject.print(RECEIPT, PAYLOAD));
        }

        @Test
        @DisplayName("punctuation and trailing driver words do not hide a match")
        void hintMatchesLoosely() {
            JavaxReceiptPrinter subject = new JavaxReceiptPrinter(
                    "POS-80", lookup(null, queue("POS80 Printer")));

            assertEquals("POS80 Printer", subject.print(RECEIPT, PAYLOAD));
        }

        @Test
        @DisplayName("an unrecognisably named sole printer is still used")
        void loneUndecidedQueueIsUsed() {
            // The counter the operator renamed, or a driver with no model in its
            // queue name. Nothing else is installed, so there is nothing to
            // confuse it with.
            JavaxReceiptPrinter subject = new JavaxReceiptPrinter(
                    "POS-80", lookup(null, queue("Printer_1"), queue("Microsoft Print to PDF")));

            assertEquals("Printer_1", subject.print(RECEIPT, PAYLOAD));
        }
    }

    @Nested
    @DisplayName("FR-RCPT-05 · detection declines rather than printing rubbish")
    class Refusal {

        @Test
        @DisplayName("the Windows default PDF writer is never printed to")
        void pdfWriterIsNeverChosen() {
            PrintService pdf = queue("Microsoft Print to PDF");
            PrintService office = queue("HP LaserJet Pro M404");
            JavaxReceiptPrinter subject = new JavaxReceiptPrinter("POS-80", lookup(pdf, pdf, office,
                    queue("Microsoft XPS Document Writer"), queue("Fax")));

            PrinterException failure = assertThrows(PrinterException.class,
                    () -> subject.print(RECEIPT, PAYLOAD));

            assertEquals("PRINTER_NOT_FOUND", failure.getCode());
            assertTrue(failure.getDetails().get("available").toString().contains("Microsoft Print to PDF"),
                    "the installed queues are listed so the operator can pick one");
        }

        @Test
        @DisplayName("an office printer is not mistaken for the receipt printer")
        void officePrinterIsNotGuessedAt() {
            JavaxReceiptPrinter subject = new JavaxReceiptPrinter("", lookup(null,
                    queue("Sharp MX-3071"), queue("Brother HL-L2350DW")));

            assertEquals("PRINTER_NOT_FOUND",
                    assertThrows(PrinterException.class, () -> subject.print(RECEIPT, PAYLOAD)).getCode());
        }
    }

    /** A queue that accepts whatever it is given, so tests assert on the choice. */
    private static PrintService queue(String name) {
        PrintService service = mock(PrintService.class);
        when(service.getName()).thenReturn(name);
        when(service.isDocFlavorSupported(any())).thenReturn(true);
        when(service.createPrintJob()).thenReturn(mock(DocPrintJob.class));
        return service;
    }

    private JavaxReceiptPrinter.PrinterLookup lookup(PrintService systemDefault, PrintService... installed) {
        return new JavaxReceiptPrinter.PrinterLookup() {
            @Override
            public PrintService[] available(DocFlavor flavor) {
                return Arrays.copyOf(installed, installed.length);
            }

            @Override
            public PrintService defaultPrinter() {
                return systemDefault;
            }
        };
    }

    @Nested
    @DisplayName("Queue grading")
    class Grading {

        @Test
        @DisplayName("model prefixes are matched at the start, never inside a word")
        void prefixesDoNotMatchMidWord() {
            List.of("Sharp MX-3071", "Canon LBP6030", "HP OfficeJet 8010")
                    .forEach(name -> assertEquals(ReceiptQueueMatcher.Confidence.NO,
                            ReceiptQueueMatcher.confidence(name), name));
        }

        @Test
        @DisplayName("a brand that makes both ranges is graded by model line")
        void brandAloneDecidesNothing() {
            assertEquals(ReceiptQueueMatcher.Confidence.YES,
                    ReceiptQueueMatcher.confidence("EPSON TM-T20III"));
            assertEquals(ReceiptQueueMatcher.Confidence.NO,
                    ReceiptQueueMatcher.confidence("EPSON WorkForce WF-2830"));
        }

        @Test
        @DisplayName("an unrecognised name is neither ruled in nor out")
        void unknownNameIsUndecided() {
            assertEquals(ReceiptQueueMatcher.Confidence.MAYBE,
                    ReceiptQueueMatcher.confidence("Printer_1"));
        }
    }
}
