import { describe, expect, it } from 'vitest';
import {
  afterCustomerRate,
  cartDiscountAmount,
  clampLineDiscount,
  effectiveUnitPrice,
  needsApproval,
  priceLevelFor,
  unitPriceFor,
} from '../discounts';
import type { Customer } from '../types';

const customer = (over: Partial<Customer>): Customer => ({
  id: 'c1',
  name: 'Test',
  phone: '0244000000',
  customerType: 'retail',
  totalPurchased: 0,
  salesCount: 0,
  ...over,
});

describe('price level — FR-PRICE-04', () => {
  it('walks in at retail', () => {
    expect(priceLevelFor(null)).toBe('RETAIL');
    expect(priceLevelFor(customer({ customerType: 'retail' }))).toBe('RETAIL');
  });

  it('trusts the level the server decided', () => {
    expect(priceLevelFor(customer({ customerType: 'retail', priceLevel: 'TRADE' }))).toBe('TRADE');
  });

  it('puts a company on trade, which the old list of types missed', () => {
    // The screen used to test `type === 'electrician' || 'contractor'` in three
    // places, so a company — which is a trade customer — was charged retail.
    expect(priceLevelFor(customer({ customerType: 'company' }))).toBe('TRADE');
    expect(priceLevelFor(customer({ customerType: 'electrician' }))).toBe('TRADE');
    expect(priceLevelFor(customer({ customerType: 'contractor' }))).toBe('TRADE');
  });
});

describe("the customer's agreed rate — FR-PRICE-05", () => {
  it('takes the rate off the price', () => {
    expect(afterCustomerRate(50, 8)).toBe(46);
  });

  it('leaves a price alone when there is no rate', () => {
    expect(afterCustomerRate(50)).toBe(50);
    expect(afterCustomerRate(50, 0)).toBe(50);
  });

  it('rounds half up, as the server does', () => {
    // 13.33 less 7.5% is 12.32525 — 12.33, not 12.32.
    expect(afterCustomerRate(13.33, 7.5)).toBe(12.33);
  });

  it('stacks the level and the rate, which is the design', () => {
    const contractor = customer({ customerType: 'contractor', discountRate: 10 });
    const product = { retailPrice: 100, tradePrice: 90 };

    // Trade level first (90), then the agreed 10% (81). The two are different
    // promises: one is what contractors pay, one is the deal with this firm.
    expect(unitPriceFor(product, { conversionFactor: 1 }, contractor)).toBe(81);
    expect(unitPriceFor(product, { conversionFactor: 1 }, null)).toBe(100);
  });

  it('prices a multi-unit pack from the conversion factor', () => {
    const product = { retailPrice: 10, tradePrice: 9 };
    expect(unitPriceFor(product, { conversionFactor: 12 }, null)).toBe(120);
  });

  it('prefers a price set on the unit itself', () => {
    const product = { retailPrice: 10, tradePrice: 9 };
    expect(unitPriceFor(product, { conversionFactor: 12, price: 110 }, null)).toBe(110);
  });
});

describe('line discounts — FR-POS-10', () => {
  it('allows anything within the ceiling', () => {
    expect(clampLineDiscount(100, 5, 10)).toBe(5);
  });

  it('holds a larger ask to the ceiling', () => {
    expect(clampLineDiscount(100, 50, 10)).toBe(10);
  });

  it('never exceeds the line, whatever the ceiling says', () => {
    expect(clampLineDiscount(100, 500, 200)).toBe(100);
  });

  it('refuses to turn a negative ask into money back', () => {
    expect(clampLineDiscount(100, -20, 10)).toBe(0);
  });
});

describe('cart discounts — FR-POS-10', () => {
  it('takes the percentage off the subtotal', () => {
    expect(cartDiscountAmount(200, 10)).toBe(20);
  });

  it('is taken after line discounts, as the till quotes it', () => {
    // GH₵100 with GH₵20 already off a line is GH₵80 on the screen; 10% off
    // what the customer is looking at is GH₵8, not GH₵10.
    expect(cartDiscountAmount(80, 10)).toBe(8);
  });

  it('is nothing when no discount was given', () => {
    expect(cartDiscountAmount(200, 0)).toBe(0);
  });

  it('asks for approval only past the ceiling', () => {
    expect(needsApproval(10, 10)).toBe(false);
    expect(needsApproval(10.5, 10)).toBe(true);
    expect(needsApproval(0, 0)).toBe(false);
  });
});

describe('the floor is measured after the discount — BR-10', () => {
  it('reports what the customer actually pays per unit', () => {
    // Two at GH₵60 is GH₵120; GH₵40 off settles at GH₵40 each — under a GH₵50
    // floor, though the line was rung at GH₵60 and passed every check made
    // against the price as entered.
    expect(effectiveUnitPrice(2, 60, 4000 / 100)).toBe(40);
  });

  it('is the unit price when nothing was taken off', () => {
    expect(effectiveUnitPrice(3, 12.5, 0)).toBe(12.5);
  });

  it('never goes below zero', () => {
    expect(effectiveUnitPrice(1, 10, 5000)).toBe(0);
  });
});
