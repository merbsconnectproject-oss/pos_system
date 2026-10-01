package gh.giftedlabs.pos.service.impl;

import java.util.List;
import java.util.Locale;

/**
 * Grades the operating system's print queues by how much each one looks like
 * the counter's receipt printer — FR-RCPT-02.
 *
 * <p>A counter is set up by whoever is standing in the shop, with whatever
 * driver the box came with. The same 80mm hardware installs itself as
 * {@code XPrinter} from the vendor disc, as {@code XP-80C} from the Windows
 * update catalogue, and as {@code Generic / Text Only} when the operator picks
 * the stock RAW driver — almost never as {@code POS-80}. A printer name pinned
 * in configuration is therefore wrong on most installs, and refusing to print
 * because the name does not match leaves a shop unable to hand over a receipt
 * for a sale that has already been recorded.
 *
 * <p>So the configured name is a hint and this class does the finding. What it
 * will not do is guess: a 3-inch ESC/POS stream is pages of rubbish on an A4
 * laser and an unasked-for file in a PDF writer, so a queue that is recognisably
 * either is ruled out rather than fallen back to.
 */
final class ReceiptQueueMatcher {

    /** How much a queue name looks like a receipt printer. */
    enum Confidence {
        /** Recognisably something else — a virtual queue or a page printer. */
        NO,
        /** Nothing either way: an unbranded or unrecognised name. */
        MAYBE,
        /** Named like a receipt printer. */
        YES
    }

    /**
     * Queues that accept the bytes and produce no receipt.
     *
     * <p>These matter because {@code isDocFlavorSupported(AUTOSENSE)} is true
     * for all of them, and on a fresh Windows install one of them — usually
     * Microsoft Print to PDF — is the system default.
     */
    private static final List<String> VIRTUAL = List.of(
            "pdf", "xpsdocumentwriter", "onenote", "sendto", "fax", "evernote", "snagit");

    /**
     * Page printers, by model line rather than by brand. Brands are no use
     * here: Epson and Brother both make thermal receipt printers alongside
     * their office range, so {@code EPSON TM-T20} must survive this list while
     * {@code EPSON WorkForce} must not.
     */
    private static final List<String> PAGE_PRINTERS = List.of(
            "laserjet", "officejet", "deskjet", "pagewide", "inkjet", "workforce",
            "ecotank", "pixma", "maxify", "imageclass", "imagerunner", "irady",
            "workcentre", "versalink", "altalink", "phaser", "ecosys", "taskalfa",
            "bizhub", "aficio", "lexmark", "mfcl", "dcpl", "hll", "sharpmx", "canonlbp");

    /** Substrings only a receipt printer carries. */
    private static final List<String> RECEIPT_MARKERS = List.of(
            "xprinter", "thermal", "receipt", "escpos", "pos58", "pos80", "58mm", "80mm",
            "textonly", "bixolon", "zjiang", "gprinter", "rongta", "munbyn", "goojprt",
            "hprt", "netum", "3nstar", "sprt", "epsontm");

    /** Model-number prefixes: XP-80C, TM-T20, POS-80, SRP-350, TSP143, RP80, ZJ-5890. */
    private static final List<String> RECEIPT_PREFIXES = List.of(
            "xp", "tm", "pos", "srp", "tsp", "zj", "gp", "rp", "ct");

    private ReceiptQueueMatcher() {
    }

    /**
     * Prefixes are matched at the start and never as a substring, because
     * {@code rp} sits inside {@code Sharp} and {@code tm} inside {@code Optima}
     * — a shop with an office printer must not have its receipts sent there.
     */
    static Confidence confidence(String queueName) {
        String name = normalise(queueName);
        if (name.isEmpty()) return Confidence.NO;
        if (matches(name, VIRTUAL) || matches(name, PAGE_PRINTERS)) return Confidence.NO;
        if (matches(name, RECEIPT_MARKERS)) return Confidence.YES;
        if (RECEIPT_PREFIXES.stream().anyMatch(name::startsWith)) return Confidence.YES;
        return Confidence.MAYBE;
    }

    /**
     * Whether a queue is the one the configured name was reaching for, allowing
     * for punctuation and for the driver appending its own words: a hint of
     * {@code POS-80} matches {@code POS80}, {@code POS-80 Printer} and
     * {@code Printer POS-80}.
     */
    static boolean matchesHint(String queueName, String hint) {
        String name = normalise(queueName);
        String wanted = normalise(hint);
        if (name.isEmpty() || wanted.length() < 3) return false;
        return name.contains(wanted) || wanted.contains(name);
    }

    /** Case and punctuation are driver noise, so neither survives here. */
    private static String normalise(String value) {
        if (value == null) return "";
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static boolean matches(String normalised, List<String> markers) {
        return markers.stream().anyMatch(normalised::contains);
    }
}
