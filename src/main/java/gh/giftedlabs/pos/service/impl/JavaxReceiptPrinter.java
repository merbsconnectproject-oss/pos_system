package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.config.PrinterProperties;
import gh.giftedlabs.pos.exception.PrinterException;
import gh.giftedlabs.pos.service.ReceiptPrinter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.print.Doc;
import javax.print.DocFlavor;
import javax.print.DocPrintJob;
import javax.print.PrintException;
import javax.print.PrintService;
import javax.print.PrintServiceLookup;
import javax.print.SimpleDoc;
import javax.print.attribute.HashPrintRequestAttributeSet;
import javax.print.attribute.standard.JobName;
import java.util.Arrays;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;

/**
 * In-process RAW printing for the local-first counter deployment.
 *
 * <p>The browser never owns the device and never opens a print dialogue. Java
 * hands the ESC/POS bytes to the operating-system spooler, which reaches USB or
 * a network queue using the printer configured on that counter.
 */
@Service
public class JavaxReceiptPrinter implements ReceiptPrinter {

    private static final DocFlavor FLAVOR = DocFlavor.BYTE_ARRAY.AUTOSENSE;

    private final String configuredName;
    private final PrinterLookup printers;

    @Autowired
    public JavaxReceiptPrinter(PrinterProperties properties) {
        this(properties.name(), new SystemPrinterLookup());
    }

    JavaxReceiptPrinter(String configuredName, PrinterLookup printers) {
        this.configuredName = configuredName == null ? "" : configuredName.trim();
        this.printers = printers;
    }

    @Override
    public String print(String receiptNumber, String base64Payload) {
        byte[] payload;
        try {
            payload = Base64.getDecoder().decode(base64Payload);
        } catch (IllegalArgumentException ex) {
            throw new PrinterException("INVALID_PRINT_PAYLOAD",
                    "The receipt data is not valid ESC/POS Base64.", Map.of());
        }
        if (payload.length == 0) {
            throw new PrinterException("INVALID_PRINT_PAYLOAD",
                    "The receipt data is empty.", Map.of());
        }

        PrintService printer = selectPrinter();
        try {
            DocPrintJob job = printer.createPrintJob();
            Doc document = new SimpleDoc(payload, FLAVOR, null);
            HashPrintRequestAttributeSet attributes = new HashPrintRequestAttributeSet();
            attributes.add(new JobName("Receipt " + receiptNumber, Locale.ENGLISH));
            job.print(document, attributes);
            return printer.getName();
        } catch (PrintException | RuntimeException ex) {
            throw new PrinterException("PRINTER_OFFLINE",
                    "The receipt could not be sent to printer " + printer.getName() + ".",
                    Map.of("printer", printer.getName()));
        }
    }

    private PrintService selectPrinter() {
        PrintService[] available = printers.available(FLAVOR);
        if (!configuredName.isBlank()) {
            return Arrays.stream(available)
                    .filter(printer -> printer.getName().equalsIgnoreCase(configuredName))
                    .findFirst()
                    .orElseThrow(() -> new PrinterException("PRINTER_NOT_FOUND",
                            "Configured printer " + configuredName + " is not available.",
                            Map.of("printer", configuredName,
                                    "available", Arrays.stream(available).map(PrintService::getName).toList())));
        }

        PrintService fallback = printers.defaultPrinter();
        if (fallback != null && fallback.isDocFlavorSupported(FLAVOR)) return fallback;
        throw new PrinterException("PRINTER_NOT_FOUND",
                "No raw-capable receipt printer is configured on this counter.", Map.of());
    }

    interface PrinterLookup {
        PrintService[] available(DocFlavor flavor);
        PrintService defaultPrinter();
    }

    private static final class SystemPrinterLookup implements PrinterLookup {
        @Override
        public PrintService[] available(DocFlavor flavor) {
            return PrintServiceLookup.lookupPrintServices(flavor, null);
        }

        @Override
        public PrintService defaultPrinter() {
            return PrintServiceLookup.lookupDefaultPrintService();
        }
    }
}
