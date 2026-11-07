package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.security.PosPrincipal;

import java.io.OutputStream;

/**
 * FR-SET-08: the client's own data, on request.
 *
 * <p>"Data export of all business data on request" is a contractual term, not
 * a convenience. The per-screen CSV buttons write out whatever rows the browser
 * had loaded, which is a different and much smaller promise — a shop asking for
 * its data and receiving the last hundred receipts has not received its data.
 *
 * <p>Streamed rather than assembled in memory. A shop's sale table is the one
 * that grows without limit, and holding a year of it as a string to hand back
 * is how an export takes the counter down.
 */
public interface ExportService {

    /** What an export is written as. */
    enum Format {
        /**
         * Every table, as one JSON document. The archive an owner keeps, and
         * the one a migration reads.
         */
        JSON,
        /**
         * The accounting view — sales, lines, payments, expenses, returns — as
         * a zip of CSV files, which is what a bookkeeper can open.
         */
        CSV
    }

    /**
     * Write the whole business to {@code out}.
     *
     * <p>Audited before a byte is written (FR-AUDIT-02 lists data export among
     * the actions that must be logged): an export that fails halfway still
     * happened, and the record of who asked for it is the point.
     */
    void export(Format format, OutputStream out, PosPrincipal actor, String clientIp);

    /** The filename to offer, which carries the date the export was taken. */
    String filenameFor(Format format);
}
