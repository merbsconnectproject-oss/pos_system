import { describe, expect, it } from 'vitest';
import { createScanDetector } from '../useScanner';
import { weightedAverageCost, costPerBaseUnit } from '../stockCosting';

/**
 * Telling a scanner from a person — FR-POS-02.
 *
 * A scanner types faster than a human can, and that is the only difference the
 * screen can see. Getting this wrong in one direction turns a typed SKU into a
 * phantom scan; in the other, it drops real scans and the cashier gives up on
 * the gun.
 */
describe('scan detection', () => {
  /** Feeds a code at a fixed keystroke interval and returns what came back. */
  const type = (code: string, intervalMs: number, startAt = 1_000) => {
    const detector = createScanDetector();
    let at = startAt;
    let result: string | null = null;
    for (const character of code) {
      detector.push(character, at);
      at += intervalMs;
    }
    result = detector.push('Enter', at);
    return result;
  };

  it('accepts a burst at machine speed', () => {
    expect(type('5901234123457', 8)).toBe('5901234123457');
  });

  it('ignores the same code typed by hand', () => {
    // 120 ms between keys is a fast typist, not a scanner.
    expect(type('5901234123457', 120)).toBeNull();
  });

  it('ignores a burst too short to be a barcode', () => {
    expect(type('12', 8)).toBeNull();
  });

  it('tolerates one slow keystroke in an otherwise machine-speed burst', () => {
    const detector = createScanDetector();
    let at = 1_000;
    const code = '5901234123457';

    code.split('').forEach((character, index) => {
      // One stall in the middle — a USB hiccup, not a human.
      at += index === 6 ? 90 : 8;
      detector.push(character, at);
    });

    expect(detector.push('Enter', at + 8)).toBe(code);
  });

  it('forgets a half-typed code after an idle gap', () => {
    const detector = createScanDetector();
    detector.push('5', 1_000);
    detector.push('9', 1_008);
    // Long pause: whatever follows is a new scan, not a continuation.
    detector.push('0', 60_000);
    expect(detector.push('Enter', 60_008)).toBeNull();
  });
});

/**
 * BR-4: weighted average cost, and BR-5's frozen cost depends on it being right.
 */
describe('weighted average cost — BR-4', () => {
  it('averages a new delivery into what is already on the shelf', () => {
    // 75 @ 42.00 then 50 @ 50.00 is 125 @ 45.20 — the worked example from the
    // acceptance checklist.
    expect(weightedAverageCost(75, 42, 50, 50)).toBe(45.2);
  });

  it('takes the delivery cost outright when the shelf is empty', () => {
    expect(weightedAverageCost(0, 0, 10, 12.5)).toBe(12.5);
  });

  it('is unmoved by a delivery of nothing', () => {
    expect(weightedAverageCost(40, 9.75, 0, 99)).toBe(9.75);
  });

  it('converts a purchase unit cost to a per-base-unit cost — FR-UOM-05', () => {
    // A drum of 100 m at 450.00 is 4.50 a metre.
    expect(costPerBaseUnit(450, 100)).toBe(4.5);
  });

  it('treats a missing conversion factor as one, rather than dividing by zero', () => {
    expect(costPerBaseUnit(450, 0)).toBe(450);
  });
});
