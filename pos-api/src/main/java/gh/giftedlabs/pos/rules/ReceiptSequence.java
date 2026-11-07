package gh.giftedlabs.pos.rules;

/**
 * Receipt numbering — BR-6.
 *
 * <p>Numbers are per outlet, gapless and never reused, formatted
 * {@code {OUTLET}-{TERMINAL}-{SEQ}} — for example {@code INC-01-004312}.
 *
 * <p>Each terminal holds a <strong>pre-allocated block</strong> of sequence
 * numbers. The server issues and records blocks, and rejects a number outside
 * the block it handed out. Under the local-first topology the block is issued
 * at install and refreshed on request; it is what lets a terminal number
 * receipts with no server in the path at all.
 *
 * <p>Port of the frontend's {@code src/receiptSequence.ts}.
 */
public final class ReceiptSequence {

    private static final int SEQ_PAD = 6;

    private ReceiptSequence() {
    }

    /** An allocated range of sequence numbers held by one terminal. */
    public record SequenceBlock(String outletPrefix, String terminalCode, long start, long end, long current) {
    }

    /** A number taken from a block, with the block advanced past it. */
    public record IssuedReceipt(String receiptNumber, SequenceBlock block) {
    }

    /** Thrown when a terminal has consumed its whole block and must request another. */
    public static class BlockExhaustedException extends RuntimeException {
        public BlockExhaustedException(String message) {
            super(message);
        }
    }

    public static SequenceBlock createBlock(String outletPrefix, String terminalCode, long start, long size) {
        return new SequenceBlock(outletPrefix, terminalCode, start, start + size - 1, start);
    }

    public static SequenceBlock createBlock(String outletPrefix, String terminalCode, long start) {
        return createBlock(outletPrefix, terminalCode, start, 1000L);
    }

    public static String format(SequenceBlock block, long sequence) {
        return format(block.outletPrefix(), block.terminalCode(), sequence);
    }

    public static String format(String outletPrefix, String terminalCode, long sequence) {
        return String.format("%s-%s-%0" + SEQ_PAD + "d", outletPrefix, terminalCode, sequence);
    }

    /**
     * Take the next number. Returns the updated block so the caller stores it —
     * a number is consumed exactly once and never reissued.
     */
    public static IssuedReceipt issue(SequenceBlock block) {
        if (block.current() > block.end()) {
            throw new BlockExhaustedException(
                    "Receipt block %s-%s is exhausted (%d-%d). Request a new block."
                            .formatted(block.outletPrefix(), block.terminalCode(), block.start(), block.end()));
        }
        return new IssuedReceipt(
                format(block, block.current()),
                new SequenceBlock(block.outletPrefix(), block.terminalCode(),
                        block.start(), block.end(), block.current() + 1));
    }

    /** Numbers left before the terminal must ask the server for another block. */
    public static long remaining(SequenceBlock block) {
        return Math.max(0L, block.end() - block.current() + 1);
    }
}
