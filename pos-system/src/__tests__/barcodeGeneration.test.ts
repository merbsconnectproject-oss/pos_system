import { describe, expect, it } from 'vitest';
import { generateInternalBarcode, isValidEan13 } from '../catalogue';

/**
 * FR-PROD-04: a product that arrived without a barcode still has to scan.
 *
 * The catalogue could only ever print a code somebody had typed in, so a new
 * product went to the shelf with a blank label. These assert the generated code
 * is a real EAN-13 — a wrong check digit is not a barcode, it is a scanner that
 * looks broken.
 */
describe('internal barcode generation', () => {
  it('produces a valid EAN-13', () => {
    const code = generateInternalBarcode('SKU-CABLE-2.5MM');
    expect(code).toHaveLength(13);
    expect(isValidEan13(code)).toBe(true);
  });

  it('uses the 20-29 in-store range, which no manufacturer is issued', () => {
    for (const seed of ['a', 'SKU-1', 'product-42', '']) {
      expect(generateInternalBarcode(seed).slice(0, 2)).toBe('20');
    }
  });

  it('is deterministic, so pressing generate twice proposes the same number', () => {
    expect(generateInternalBarcode('SKU-SOCKET-13A'))
      .toBe(generateInternalBarcode('SKU-SOCKET-13A'));
  });

  it('never reissues a code the catalogue already holds', () => {
    const first = generateInternalBarcode('SKU-LAMP');
    const second = generateInternalBarcode('SKU-LAMP', [first]);
    const third = generateInternalBarcode('SKU-LAMP', [first, second]);

    expect(second).not.toBe(first);
    expect(third).not.toBe(first);
    expect(third).not.toBe(second);
    [second, third].forEach((code) => expect(isValidEan13(code)).toBe(true));
  });

  it('walks one code at a time, so a collision lands next door', () => {
    const first = generateInternalBarcode('SKU-STEP');
    const second = generateInternalBarcode('SKU-STEP', [first]);

    // The body was padded a digit wider than the twelve a check digit is taken
    // from, and the overflow was trimmed — so the digit a collision moves was
    // the digit being thrown away, and the walk advanced in steps of ten.
    expect(Number(second.slice(0, 12)) - Number(first.slice(0, 12))).toBe(1);
  });

  it('rejects a code whose check digit does not hold', () => {
    const valid = generateInternalBarcode('SKU-CHECK');
    const wrong = valid.slice(0, 12) + ((Number(valid[12]) + 1) % 10);

    expect(isValidEan13(valid)).toBe(true);
    expect(isValidEan13(wrong)).toBe(false);
    expect(isValidEan13('20123')).toBe(false);
  });

  it('agrees with a known EAN-13 check digit', () => {
    // 4006381333931 is the textbook EAN-13 example.
    expect(isValidEan13('4006381333931')).toBe(true);
  });
});
