/**
 * Receipt numbering — BR-6.
 *
 * Numbers are per outlet, gapless and never reused, formatted
 * `{OUTLET}-{TERMINAL}-{SEQ}` (e.g. `INC-01-004312`).
 *
 * Each terminal holds a **pre-allocated block** of sequence numbers so it can
 * keep numbering receipts while offline (FR-SYNC-03). This module models that
 * block on the client; the server issues and records blocks, and rejects a
 * number outside the block it handed out.
 */

export interface SequenceBlock {
  outletPrefix: string;
  terminalCode: string;
  start: number;
  end: number;
  current: number;
}

const SEQ_PAD = 6;

/** Allocated by the server in production; seeded locally so the POS works offline. */
export function createBlock(
  outletPrefix: string,
  terminalCode: string,
  start: number,
  size = 1000,
): SequenceBlock {
  return { outletPrefix, terminalCode, start, end: start + size - 1, current: start };
}

export function formatReceiptNumber(block: SequenceBlock, sequence: number): string {
  return `${block.outletPrefix}-${block.terminalCode}-${String(sequence).padStart(SEQ_PAD, '0')}`;
}

export interface IssuedReceipt {
  receiptNumber: string;
  block: SequenceBlock;
}

/**
 * Take the next number. Returns the updated block so the caller stores it —
 * a number is consumed exactly once and never reissued.
 */
export function issueReceiptNumber(block: SequenceBlock): IssuedReceipt {
  if (block.current > block.end) {
    throw new Error(
      `Receipt block ${block.outletPrefix}-${block.terminalCode} is exhausted (${block.start}-${block.end}). Request a new block.`,
    );
  }
  return {
    receiptNumber: formatReceiptNumber(block, block.current),
    block: { ...block, current: block.current + 1 },
  };
}

/** Numbers left before the terminal must ask the server for another block. */
export function remainingInBlock(block: SequenceBlock): number {
  return Math.max(0, block.end - block.current + 1);
}
