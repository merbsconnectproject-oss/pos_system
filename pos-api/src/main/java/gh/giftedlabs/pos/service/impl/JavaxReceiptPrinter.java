package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.config.PrinterProperties;
import gh.giftedlabs.pos.exception.PrinterException;
import gh.giftedlabs.pos.service.ReceiptPrinter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * In-process RAW printing for the local-first counter deployment.
 *
 * <p>The browser never owns the device and never opens a print dialogue. Java
 * hands the ESC/POS bytes to the operating-system spooler, which reaches USB or
 * a network queue using the printer installed on that counter.
 *
 * <p>Which printer that is, is discovered rather than declared. The configured
 * name is a hint: see {@link ReceiptQueueMatcher} for why a pinned name is
 * wrong on most installs.
 */
@Service
public class JavaxReceiptPrinter implements ReceiptPrinter {

    private static final Logger log = LoggerFactory.getLogger(JavaxReceiptPrinter.class);

    private static final DocFlavor FLAVOR = DocFlavor.BYTE_ARRAY.AUTOSENSE;

    private final String preferredName;
    private final PrinterLookup printers;

    @Autowired
    public JavaxReceiptPrinter(PrinterProperties properties) {
        this(properties.name(), new SystemPrinterLookup());
    }

    JavaxReceiptPrinter(String preferredName, PrinterLookup printers) {
        this.preferredName = preferredName == null ? "" : preferredName.trim();
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

    /**
     * FR-RCPT-02/05. In order: the exact configured name, a queue the configured
     * name was plainly reaching for, then detection.
     *
     * <p>A configured name that is not installed does not fail the print. It
     * used to, and that is the bug this ordering fixes — a counter whose driver
     * registered itself as {@code XPrinter} could not print at all while the
     * shipped default said {@code POS-80}. The name is logged when it is not
     * honoured so a wrong setting is still visible in the counter's log.
     */
    private PrintService selectPrinter() {
        List<PrintService> queues = List.of(printers.available(FLAVOR));
        if (queues.isEmpty()) throw noQueueAtAll();

        if (!preferredName.isBlank()) {
            Optional<PrintService> exact = queues.stream()
                    .filter(queue -> queue.getName().equalsIgnoreCase(preferredName))
                    .findFirst();
            if (exact.isPresent()) return exact.get();

            // A loose match is inference, not instruction, so it may not land on
            // a queue that cannot produce a receipt: a name of "PDF-80" would
            // otherwise reach Microsoft Print to PDF. An exact name still wins
            // above, because that is the operator saying so.
            Optional<PrintService> near = queues.stream()
                    .filter(queue -> ReceiptQueueMatcher.confidence(queue.getName())
                            != ReceiptQueueMatcher.Confidence.NO)
                    .filter(queue -> ReceiptQueueMatcher.matchesHint(queue.getName(), preferredName))
                    .findFirst();
            if (near.isPresent()) {
                log.info("Printer \"{}\" is not installed; using \"{}\", which matches it.",
                        preferredName, near.get().getName());
                return near.get();
            }
        }

        PrintService detected = detect(queues);
        if (detected == null) throw nothingLooksLikeAReceiptPrinter(names(queues));
        if (!preferredName.isBlank()) {
            log.warn("Printer \"{}\" is not installed on this counter. Receipts are going to "
                            + "the detected printer \"{}\". Installed queues: {}.",
                    preferredName, detected.getName(), names(queues));
        }
        return detected;
    }

    /**
     * The receipt printer among the installed queues, or null when the machine
     * gives no safe answer.
     *
     * <p>Three passes, narrowing from evidence to circumstance: a queue named
     * like a receipt printer, else the operating-system default provided it is
     * not recognisably something else, else the only such queue on the machine.
     * A counter holding nothing but a PDF writer and an office laser reaches
     * none of them, which is the intended outcome — no receipt is better than
     * twelve pages of control codes.
     */
    private PrintService detect(List<PrintService> queues) {
        PrintService systemDefault = printers.defaultPrinter();

        List<PrintService> named = gradedAs(queues, ReceiptQueueMatcher.Confidence.YES);
        if (!named.isEmpty()) return preferring(systemDefault, named);

        List<PrintService> possible = gradedAs(queues, ReceiptQueueMatcher.Confidence.MAYBE);
        if (systemDefault != null
                && possible.stream().anyMatch(queue -> queue.getName().equals(systemDefault.getName()))
                && systemDefault.isDocFlavorSupported(FLAVOR)) {
            return systemDefault;
        }
        return possible.size() == 1 ? possible.getFirst() : null;
    }

    private static List<PrintService> gradedAs(List<PrintService> queues, ReceiptQueueMatcher.Confidence grade) {
        return queues.stream()
                .filter(queue -> ReceiptQueueMatcher.confidence(queue.getName()) == grade)
                .toList();
    }

    /**
     * Two thermal printers on one counter is the case {@code pos.printer.name}
     * exists for. Until it is set, the operating system's own choice is a better
     * answer than whichever queue the spooler happened to list first.
     */
    private static PrintService preferring(PrintService systemDefault, List<PrintService> candidates) {
        if (systemDefault == null) return candidates.getFirst();
        return candidates.stream()
                .filter(queue -> queue.getName().equals(systemDefault.getName()))
                .findFirst()
                .orElseGet(candidates::getFirst);
    }

    /**
     * No queue accepts raw bytes. Worth separating from "nothing installed",
     * because the first is a driver chosen wrongly and the second is a cable.
     */
    private PrinterException noQueueAtAll() {
        List<String> installed = names(List.of(printers.available(null)));
        String message = installed.isEmpty()
                ? "No printer is installed on this counter."
                : "None of the printers installed on this counter accepts raw receipt data.";
        return new PrinterException("PRINTER_NOT_FOUND", message, details(installed));
    }

    private PrinterException nothingLooksLikeAReceiptPrinter(List<String> installed) {
        return new PrinterException("PRINTER_NOT_FOUND",
                "No receipt printer could be identified on this counter. Installed printers: "
                        + String.join(", ", installed) + ".",
                details(installed));
    }

    private Map<String, Object> details(List<String> installed) {
        Map<String, Object> details = new LinkedHashMap<>();
        if (!preferredName.isBlank()) details.put("printer", preferredName);
        details.put("available", installed);
        return details;
    }

    private static List<String> names(List<PrintService> queues) {
        return queues.stream().map(PrintService::getName).toList();
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
