/**
 * Money — BR-11.
 *
 * THE CONTRACT
 * ------------
 * On the wire and in the database, money is an **integer number of pesewas**.
 * `1850` is GH₵ 18.50. There are no fractional pesewas and no floats in storage.
 *
 * Inside the UI, values are carried as major-unit numbers because every input,
 * chart and table in this application reads and writes GH₵. The boundary is
 * explicit: `toPesewas` on the way out to an API, `fromPesewas` on the way in.
 * Every arithmetic result that will be persisted or compared must pass through
 * `roundMoney` first, so the frontend and the server agree to the pesewa.
 *
 * Rounding is **half-up**, applied **per line**, and totals are summed from
 * already-rounded lines — never rounded once at the end. Two lines of 0.125
 * therefore total 0.26, not 0.25.
 */

/**
 * Half-up to 2dp. JavaScript's Math.round is half-up for positives but
 * half-away-from-zero is wanted for negatives (refunds).
 *
 * The scaled value is normalised with `toPrecision(12)` before rounding.
 * A `Number.EPSILON` nudge is not enough: near 100 the gap between adjacent
 * doubles is ~1.4e-14, far larger than EPSILON, so `1.005 * 100` sits at
 * 100.49999999999999 and rounds *down*. That disagreed with the server's
 * `BigDecimal.setScale(2, HALF_UP)` by one pesewa on values like 1.005 and
 * 0.145. Both sides are now pinned by docs/contract/test-vectors.json.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Number((Math.abs(value) * 100).toPrecision(12)))) / 100;
}

/** Major units (GH₵ 18.50) → wire format (1850). Same normalisation as `roundMoney`. */
export function toPesewas(major: number): number {
  if (!Number.isFinite(major)) return 0;
  const sign = major < 0 ? -1 : 1;
  return sign * Math.round(Number((Math.abs(major) * 100).toPrecision(12)));
}

/** Wire format (1850) → major units (18.50). */
export function fromPesewas(minor: number): number {
  return Math.trunc(minor) / 100;
}

/**
 * A line total, rounded once at the line as BR-11 requires.
 * Quantity is held to 3dp (BR-12) to support cut lengths.
 */
export function lineTotal(quantity: number, unitPrice: number, discount = 0): number {
  return roundMoney(roundQuantity(quantity) * unitPrice - discount);
}

/** Sum of already-rounded line values. Do not round the result again. */
export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((total, value) => total + roundMoney(value), 0));
}

/**
 * BR-12: quantities are stored to 3 decimal places in the base unit.
 * Normalised the same way as `roundMoney` — see the note there — so this
 * agrees with the server's `setScale(3, HALF_UP)` on cut lengths.
 */
export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Number((Math.abs(value) * 1000).toPrecision(12)))) / 1000;
}

/**
 * Exact money equality. Replaces tolerance checks like `Math.abs(a - b) > 0.05`,
 * which silently accept a 5-pesewa shortfall on a payment (FR-PAY-05).
 */
export function moneyEquals(a: number, b: number): boolean {
  return toPesewas(a) === toPesewas(b);
}

/** Signed comparison in pesewas: negative when a < b, 0 when equal. */
export function compareMoney(a: number, b: number): number {
  return toPesewas(a) - toPesewas(b);
}

/**
 * Settle a cash payment from the amount physically handed to the cashier.
 *
 * The tendered amount must be the payment that is persisted. Replacing it with
 * the bill total makes an overpayment look exact and permanently loses the
 * customer's change from the receipt.
 */
export function settleCash(total: number, tendered: number): {
  amount: number;
  changeDue: number;
  sufficient: boolean;
} {
  const amount = roundMoney(tendered);
  return {
    amount,
    changeDue: Math.max(0, roundMoney(amount - total)),
    sufficient: compareMoney(amount, total) >= 0,
  };
}

/** NFR-18: currency GHS, two decimal places, grouped thousands. */
export function formatMoney(major: number, currencySymbol = 'GH₵'): string {
  const safe = Number.isFinite(major) ? major : 0;
  return `${currencySymbol} ${roundMoney(safe).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Quantities render at up to 3dp without trailing zero noise: 287.5, not 287.500. */
export function formatQuantity(value: number): string {
  return roundQuantity(value).toLocaleString('en-GB', { maximumFractionDigits: 3 });
}
