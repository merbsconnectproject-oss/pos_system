import { describe, expect, it } from 'vitest';
import {
  compareMoney,
  formatMoney,
  fromPesewas,
  lineTotal,
  moneyEquals,
  roundMoney,
  roundQuantity,
  settleCash,
  sumMoney,
  toPesewas,
} from '../money';

/**
 * BR-11: money is exact.
 *
 * The rule these protect is not "round correctly" but "round once, per line,
 * and compare exactly". Both halves have a plausible-looking wrong version —
 * rounding the total instead of the lines, and comparing within a tolerance —
 * and both wrong versions balance the drawer most days and fail on the day
 * somebody counts it.
 */
describe('money — BR-11', () => {
  it('rounds half up, not to even', () => {
    // Banker's rounding would give 0.12 here, and a shop that quotes 0.125
    // expects to be paid 13 pesewas.
    expect(roundMoney(0.125)).toBe(0.13);
    expect(roundMoney(0.135)).toBe(0.14);
  });

  it('rounds each line before summing, so two half-pesewa lines total a whole one', () => {
    // 0.125 + 0.125 is 0.25 if you sum first and 0.26 if you round first. The
    // receipt shows two lines of 0.13, and it must add up to what it shows.
    expect(sumMoney([roundMoney(0.125), roundMoney(0.125)])).toBe(0.26);
  });

  it('computes a line total, treating the discount as cash off the line', () => {
    // 3 × 18.335 settles to 55.01, not 55.02 — the reason unit prices are held
    // at four decimals rather than rounded to pesewas first.
    expect(lineTotal(3, 18.335, 0)).toBe(55.01);

    // The discount is an amount, not a percentage: two at 10.00 less GH₵10 is
    // GH₵10. Reading it as 10% would give 18 and nobody would notice until a
    // customer added it up.
    expect(lineTotal(2, 10, 10)).toBe(10);
  });

  it('survives the classic float: 0.1 + 0.2', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(moneyEquals(sumMoney([0.1, 0.2]), 0.3)).toBe(true);
  });

  it('compares exactly rather than within a tolerance', () => {
    // A pesewa apart is a difference. Tolerant comparison is how a drawer
    // silently goes short.
    expect(moneyEquals(10.0, 10.01)).toBe(false);
    expect(compareMoney(10.0, 10.01)).toBeLessThan(0);
    expect(compareMoney(10.01, 10.0)).toBeGreaterThan(0);
    expect(compareMoney(10.0, 10.0)).toBe(0);
  });

  it('round-trips through pesewas without drift', () => {
    for (const amount of [0.01, 0.05, 12.34, 999.99, 1234.56]) {
      expect(fromPesewas(toPesewas(amount))).toBe(amount);
    }
  });

  it('gives change as an exact difference', () => {
    const total = lineTotal(3, 18.335, 0); // 55.01
    const tendered = 60;
    expect(roundMoney(tendered - total)).toBe(4.99);
  });

  it('keeps the full cash tendered so an overpayment survives onto the receipt', () => {
    expect(settleCash(35, 50)).toEqual({
      amount: 50,
      changeDue: 15,
      sufficient: true,
    });
    expect(settleCash(35, 30)).toEqual({
      amount: 30,
      changeDue: 0,
      sufficient: false,
    });
  });

  it('keeps quantities at three decimals, for cable sold by the metre', () => {
    expect(roundQuantity(12.5)).toBe(12.5);
    expect(roundQuantity(0.3333333)).toBe(0.333);
  });

  it('formats in cedis with both decimal places', () => {
    expect(formatMoney(1234.5)).toContain('1,234.50');
    expect(formatMoney(0)).toContain('0.00');
  });
});
