package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.exception.PrinterException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.print.Doc;
import javax.print.DocFlavor;
import javax.print.DocPrintJob;
import javax.print.PrintService;
import javax.print.attribute.PrintRequestAttributeSet;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@DisplayName("In-process receipt printer")
class JavaxReceiptPrinterTest {

    @Test
    @DisplayName("FR-RCPT-02 · sends decoded ESC/POS bytes to the configured queue")
    void printsToConfiguredQueue() throws Exception {
        PrintService printer = mock(PrintService.class);
        DocPrintJob job = mock(DocPrintJob.class);
        when(printer.getName()).thenReturn("POS-80");
        when(printer.createPrintJob()).thenReturn(job);

        JavaxReceiptPrinter subject = new JavaxReceiptPrinter("pos-80", lookup(printer, null));
        String selected = subject.print("RAD-01-000123",
                Base64.getEncoder().encodeToString(new byte[] {0x1B, '@', 'O', 'K', '\n'}));

        assertEquals("POS-80", selected);
        verify(job).print(any(Doc.class), any(PrintRequestAttributeSet.class));
    }

    @Test
    @DisplayName("FR-RCPT-05 · an unavailable configured queue is reported for retry")
    void missingQueueIsReported() {
        JavaxReceiptPrinter subject = new JavaxReceiptPrinter("POS-80", lookup(null, null));

        PrinterException failure = assertThrows(PrinterException.class,
                () -> subject.print("RAD-01-000123", Base64.getEncoder().encodeToString(new byte[] {1})));

        assertEquals("PRINTER_NOT_FOUND", failure.getCode());
    }

    @Test
    @DisplayName("FR-RCPT-02 · malformed data never reaches the printer")
    void malformedPayloadIsRefused() {
        JavaxReceiptPrinter subject = new JavaxReceiptPrinter("POS-80", lookup(null, null));

        PrinterException failure = assertThrows(PrinterException.class,
                () -> subject.print("RAD-01-000123", "not base64!"));

        assertEquals("INVALID_PRINT_PAYLOAD", failure.getCode());
    }

    private JavaxReceiptPrinter.PrinterLookup lookup(PrintService available, PrintService fallback) {
        return new JavaxReceiptPrinter.PrinterLookup() {
            @Override
            public PrintService[] available(DocFlavor flavor) {
                return available == null ? new PrintService[0] : new PrintService[] {available};
            }

            @Override
            public PrintService defaultPrinter() {
                return fallback;
            }
        };
    }
}
