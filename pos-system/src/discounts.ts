/**
 * What a customer is charged, and what may be taken off it — FR-PRICE-04,
 * FR-PRICE-05, FR-POS-10, BR-10.
 *
 * <p>These rules lived inside the POS screen, which meant they could not be
 * tested and were applied inconsistently: the customer's price level was
 * worked out on one of the four paths that attach a customer, and a cart
 * discount past the cashier's ceiling was silently reduced rather than sent
 * for approval. A rule about money that only one call site obeys is not a
 * rule.
 *
 * <p>The server enforces all of this independently. Nothing here is a
 * substitute for that — it is what the till shows the customer *before* the
 * server is asked, and the two must agree or the cashier is quoting a figure
 * the sale will be refused for.
 */

import { roundMoney } from './money';
import type { Customer, Product } from './types';

/** FR-PRICE-04: which of the product's prices applies to this customer. */
export type PriceLevel = 'RETAIL' | 'TRADE';

/**
 * FR-PRICE-04: the level the server decided, or the one the type implies.
 *
 * <p>The server sends `priceLevel` on the record and that is the authority.
 * The fallback is only reached for a customer created in this tab before the
 * save comes back — and it tests the type rather than listing the trade types,
 * because the list used to omit `company` and quietly charged a firm retail.
 */
export function priceLevelFor(customer: Customer | null): PriceLevel {
  if (!customer) return 'RETAIL';
  if (customer.priceLevel) return customer.priceLevel;
  return customer.customerType === 'retail' ? 'RETAIL' : 'TRADE';
}

/**
 * FR-PRICE-05: the price after the customer's standing discount.
 *
 * <p>Rounded once, at the end, to match `Pricing.afterCustomerDiscount` on the
 * server. Discounting per unit and then multiplying compounds the rounding by
 * the quantity, so the two sides would disagree on any line of more than one.
 */
export function afterCustomerRate(price: number, discountRate = 0): number {
  if (!discountRate || discountRate <= 0) return price;
  return roundMoney(price * (1 - discountRate / 100));
}

/**
 * FR-PRICE-04 · FR-PRICE-05: what this customer pays for one of this unit.
 *
 * <p>The level first, then their agreed rate on top of it. The two stack by
 * design: the level is what a kind of customer pays, the rate is the deal this
 * particular one was given.
 */
export function unitPriceFor(
  product: Pick<Product, 'retailPrice' | 'tradePrice'>,
  unit: { price?: number; tradePrice?: number; conversionFactor: number },
  customer: Customer | null,
): number {
  const base = priceLevelFor(customer) === 'TRADE'
    ? unit.tradePrice ?? product.tradePrice * unit.conversionFactor
    : unit.price ?? product.retailPrice * unit.conversionFactor;

  return afterCustomerRate(base, customer?.discountRate ?? 0);
}

/**
 * FR-POS-10: a line discount, held to the seller's ceiling and to the line.
 *
 * <p>The ceiling is a percentage of the line rather than a flat amount: the
 * same cedi off a bulb and off a distribution board are not the same
 * concession.
 */
export function clampLineDiscount(gross: number, asked: number, ceilingPercent: number): number {
  const ceiling = roundMoney((gross * ceilingPercent) / 100);
  return Math.min(Math.max(0, roundMoney(asked)), ceiling, gross);
}

/**
 * FR-POS-10: what a percentage off the whole bill comes to.
 *
 * <p>Taken against the subtotal *after* line discounts, which is what "10%
 * off" means at a counter where one line is already marked down — the customer
 * is quoted 10% off the figure in front of them, not off a subtotal nobody
 * said out loud. The server resolves it the same way.
 */
export function cartDiscountAmount(subtotalAfterLines: number, percent: number): number {
  if (!percent || percent <= 0) return 0;
  return roundMoney((subtotalAfterLines * percent) / 100);
}

/** FR-POS-10: whether this concession needs somebody more senior. */
export function needsApproval(percent: number, ceilingPercent: number): boolean {
  return percent > ceilingPercent;
}

/**
 * BR-10: the per-unit price the customer actually pays, after everything.
 *
 * <p>The floor is measured against this, not against the price the line was
 * rung at. A line entered at the floor and then discounted settles below it,
 * which is the way around BR-10 the server used to allow.
 */
export function effectiveUnitPrice(quantity: number, unitPrice: number, discount: number): number {
  if (quantity <= 0) return unitPrice;
  return roundMoney(Math.max(0, roundMoney(quantity * unitPrice) - discount) / quantity);
}
