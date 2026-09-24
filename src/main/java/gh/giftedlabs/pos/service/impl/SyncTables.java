package gh.giftedlabs.pos.service.impl;

import java.util.List;

/**
 * What travels up the transaction channel, and how it is applied at the far end.
 *
 * <p>Declared as data rather than written out as fifteen pairs of hand-maintained
 * SQL statements. Postgres can serialise any row to JSON and rebuild it with
 * {@code json_populate_record}, so the only thing that genuinely differs per
 * table is the key to resolve a conflict on and whether a later copy may
 * overwrite an earlier one.
 *
 * <p><strong>Order is dependency order.</strong> Customers before sales, sales
 * before their lines, shifts before cash movements — applied any other way the
 * foreign keys refuse, and a batch that half-applied would be worse than one
 * that did not.
 */
final class SyncTables {

    private SyncTables() {
    }

    /**
     * @param table      the relation, which is also its JSON key
     * @param conflict   the columns that identify an existing row
     * @param upsert     true when a later copy replaces an earlier one
     * @param selection  what makes a row unsent. Parents carry {@code synced_at};
     *                   children have none and travel with their parent, because
     *                   a line without its sale is not a thing that can be
     *                   applied
     * @param stampBy    how a sent row is remembered: {@link #STAMP} writes
     *                   {@code synced_at}, {@link #WATERMARK} records the
     *                   position outside the table for one a trigger will not
     *                   let anybody update, and null means a child that travels
     *                   with its parent and is never tracked on its own
     */
    record Spec(String table, String conflict, boolean upsert, String selection, String stampBy,
                String markOn) {

        /** Stamped tables need no mark column. */
        Spec(String table, String conflict, boolean upsert, String selection, String stampBy) {
            this(table, conflict, upsert, selection, stampBy, null);
        }
    }

    /**
     * "Everything newer than the last batch", for a table nothing may update.
     *
     * <p>Four tables in this schema refuse every UPDATE by trigger —
     * {@code audit_log}, {@code inventory_movement}, {@code cash_movement} and
     * {@code product_price_history}. That is BR-2 and BR-15 doing their job: a
     * ledger somebody can edit is not a ledger. They therefore cannot carry a
     * {@code synced_at} that anybody writes, and their position is kept in
     * {@code sync_watermark} instead.
     */
    private static String sinceWatermark(String table) {
        return "created_at > %s and %s".formatted(mark(table), settled("created_at"));
    }

    /**
     * Newer than the last batch, <em>or</em> changed since it.
     *
     * <p>Some tables refuse a plain UPDATE but are not actually immutable: a sale
     * can be voided, a shift closes, a goods receipt is confirmed. Their triggers
     * permit exactly that one transition and nothing else — including a
     * {@code synced_at} stamp, because the trigger cannot tell a bookkeeping
     * column from an edit.
     *
     * <p>So they are watermarked, but on two columns. Creation alone would send a
     * sale once and never again — and the void that came afterwards, the figure
     * that actually matters, would never reach the owner while the ledger and the
     * audit log said it happened. The owner's revenue would be wrong and every
     * other table would agree it was.
     *
     * @param changed the column that records the one permitted transition
     */
    private static String sinceWatermarkOrChanged(String table, String changed) {
        return "(created_at > %1$s or %2$s > %1$s) and %3$s"
                .formatted(mark(table), changed, settled(newest(changed)));
    }

    /**
     * How long a row must have sat still before a push will believe its timestamp.
     *
     * <p>A row's {@code created_at} is when its transaction <em>started</em>, not
     * when it committed. A sale that began at 10:00:05 and commits at 10:00:10 is
     * invisible to a push reading the table at 10:00:08 — and if that push moves
     * the mark to 10:00:09, the sale is then behind the mark and
     * {@code created_at > mark} hides it for good. Nothing errors. Head office is
     * simply short one sale, for ever, and the shop's own totals disagree with the
     * owner's with no record of why.
     *
     * <p>So rows younger than this are left for the next push. It costs a couple
     * of minutes of latency on a channel that runs every fifteen, which is nothing,
     * and it is the only thing standing between a slow transaction and money that
     * silently never arrives. The alternative — re-sending an overlap every time —
     * would trip the very triggers that forced these tables onto a watermark.
     */
    private static String settled(String mark) {
        return mark + " <= now() - interval '2 minutes'";
    }

    /** A shift is marked by the later of opening and closing. */
    private static String shiftMark() {
        return "greatest(opened_at, coalesce(closed_at, opened_at))";
    }

    /** The later of a row's birth and its one permitted change. */
    private static String newest(String changed) {
        return "greatest(created_at, coalesce(%s, created_at))".formatted(changed);
    }

    /** The recorded position for a table, or the beginning of time. */
    private static String mark(String table) {
        return "coalesce((select last_sent_at from sync_watermark where table_name = '"
                + table + "'), '-infinity'::timestamptz)";
    }

    /** The row carries its own {@code synced_at}. */
    static final String STAMP = "synced_at";

    /**
     * The position is kept in {@code sync_watermark} instead.
     *
     * <p>For {@code audit_log}, whose trigger refuses every update — a log
     * somebody can write to is not a log (BR-15).
     */
    static final String WATERMARK = "watermark";

    /** Rows the shop owns and the owner only ever reads. */
    static final List<Spec> UP = List.of(
            // Reference the shop may create locally, before anything points at it.
            new Spec("customer", "id", true, "synced_at is null", STAMP),

            new Spec("shift", "id", true,
                    "(opened_at > %1$s or closed_at > %1$s) and %2$s".formatted(mark("shift"),
                            settled(shiftMark())),
                    WATERMARK, shiftMark()),
            new Spec("cash_movement", "id", false, sinceWatermark("cash_movement"), WATERMARK,
                    "created_at"),

            new Spec("sale", "id", true, sinceWatermarkOrChanged("sale", "voided_at"), WATERMARK,
                    newest("voided_at")),
            // Children: selected by their parent being in this batch, never on
            // their own. `sale_item` has no synced_at precisely because a line
            // that could travel without its sale would be an orphan at the far
            // end.
            new Spec("sale_item", "id", false,
                    "sale_id in (select id from sale where " + sinceWatermarkOrChanged("sale", "voided_at") + ")", null),
            new Spec("payment", "id", false, sinceWatermark("payment"), WATERMARK, "created_at"),

            new Spec("sale_return", "id", false, "synced_at is null", STAMP),
            new Spec("sale_return_item", "id", false,
                    "return_id in (select id from sale_return where synced_at is null)", null),

            // Purchasing. The supplier travels because a shop creates its own —
            // a storekeeper adds a vendor at the counter, and it is not head
            // office reference data like the catalogue. Without it every goods
            // receipt and order pushed up fails its foreign key at the owner,
            // silently, and the owner sees one shop's purchasing at most.
            new Spec("supplier", "id", true, "synced_at is null", STAMP),

            new Spec("purchase_order", "id", true,
                    "status <> 'DRAFT' and synced_at is null", STAMP),

            // A draft is nobody's business but the shop's, so lines follow the
            // same rule as their order rather than travelling on their own.
            new Spec("purchase_order_line", "id", false,
                    "purchase_order_id in (select id from purchase_order "
                            + "where status <> 'DRAFT' and synced_at is null)", null),

            new Spec("goods_receipt", "id", true,
                    sinceWatermarkOrChanged("goods_receipt", "confirmed_at"), WATERMARK,
                    newest("confirmed_at")),
            // Absent until now, which meant the owner received delivery
            // documents with nothing on them: no product, no quantity, no cost.
            new Spec("goods_receipt_line", "id", false,
                    "receipt_id in (select id from goods_receipt where "
                            + sinceWatermarkOrChanged("goods_receipt", "confirmed_at") + ")", null),

            new Spec("inventory_movement", "id", false, sinceWatermark("inventory_movement"), WATERMARK,
                    "created_at"),

            // Mutable: the level moves with every sale, so a later copy wins.
            // Safe because the shop is the only writer of its own outlet's rows.
            new Spec("stock_level", "product_id, outlet_id", true, "synced_at is null", STAMP),
            new Spec("product_outlet_price", "product_id, outlet_id", true, "synced_at is null", null),

            new Spec("expense", "id", true, "synced_at is null", STAMP),
            new Spec("installment_plan", "id", true, "synced_at is null", STAMP),
            new Spec("installment_plan_item", "id", false,
                    "plan_id in (select id from installment_plan where synced_at is null)", null),
            new Spec("installment_schedule_item", "id", true,
                    "plan_id in (select id from installment_plan where synced_at is null)", null),
            new Spec("installment_payment", "id", true,
                    sinceWatermark("installment_payment"), WATERMARK, "created_at"),

            // BR-15. Append-only at both ends: the trigger on the owner's copy
            // refuses an update, so the combined log is as tamper-evident as
            // each shop's own.
            new Spec("audit_log", "id", false, sinceWatermark("audit_log"), WATERMARK, "created_at"));
}
