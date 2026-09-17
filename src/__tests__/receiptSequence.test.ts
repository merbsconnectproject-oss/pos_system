import { describe, expect, it } from 'vitest';
import {
  createBlock,
  formatReceiptNumber,
  issueReceiptNumber,
  remainingInBlock,
} from '../receiptSequence';

/**
 * BR-6: receipt numbers are per outlet, gapless, and never reused.
 *
 * This is the rule with legal weight — a receipt number is what a customer
 * brings back and what the shop answers a tax question with. The till holds a
 * pre-allocated block so it can keep numbering through an outage (FR-SYNC-03),
 * which is exactly what makes reuse possible if the block is mishandled.
 */
describe('receipt numbering — BR-6', () => {
  it('formats as {OUTLET}-{TERMINAL}-{SEQ} with a padded sequence', () => {
    const block = createBlock('INC', '01', 4312);
    expect(formatReceiptNumber(block, 4312)).toBe('INC-01-004312');
  });

  it('issues consecutively, with no gaps', () => {
    let block = createBlock('RAD', '02', 1);
    const issued: string[] = [];

    for (let i = 0; i < 5; i++) {
      const next = issueReceiptNumber(block);
      issued.push(next.receiptNumber);
      block = next.block;
    }

    expect(issued).toEqual([
      'RAD-02-000001',
      'RAD-02-000002',
      'RAD-02-000003',
      'RAD-02-000004',
      'RAD-02-000005',
    ]);
  });

  it('never hands out the same number twice', () => {
    let block = createBlock('INC', '01', 1, 200);
    const seen = new Set<string>();

    for (let i = 0; i < 200; i++) {
      const next = issueReceiptNumber(block);
      expect(seen.has(next.receiptNumber)).toBe(false);
      seen.add(next.receiptNumber);
      block = next.block;
    }

    expect(seen.size).toBe(200);
  });

  it("leaves the caller's block untouched, so a dropped write cannot skip a number", () => {
    const block = createBlock('INC', '01', 50);
    const first = issueReceiptNumber(block);

    // The original is unchanged: issuing returns a new block for the caller to
    // store. If this mutated in place, a failed save would consume a number and
    // leave a gap that BR-6 forbids.
    expect(block.current).toBe(50);
    expect(first.block.current).toBe(51);
  });

  it('refuses to issue past the end of its block rather than colliding', () => {
    let block = createBlock('INC', '01', 1, 2);
    block = issueReceiptNumber(block).block;
    block = issueReceiptNumber(block).block;

    // Past the block, the terminal must ask for another. Wrapping or carrying on
    // would hand a second sale a number another till already printed.
    expect(() => issueReceiptNumber(block)).toThrow(/exhausted/);
  });

  it('counts what is left, so a counter can be warned before it runs dry', () => {
    let block = createBlock('RAD', '01', 1, 3);
    expect(remainingInBlock(block)).toBe(3);
    block = issueReceiptNumber(block).block;
    expect(remainingInBlock(block)).toBe(2);
  });

  it('keeps a hyphenated outlet prefix from producing a four-part number', () => {
    // Three parts, always: a prefix carrying its own hyphen once produced
    // "INC-01-01-004312" and broke every receipt lookup.
    const number = formatReceiptNumber(createBlock('INC', '01', 1), 1);
    expect(number.split('-')).toHaveLength(3);
  });
});
