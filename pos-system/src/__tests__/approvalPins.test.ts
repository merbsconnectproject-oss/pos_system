import { afterEach, describe, expect, it, vi } from 'vitest';
import { salesApi, toCompletedSale, type SaleWire } from '../salesApi';
import type { CartItem, Product } from '../types';

// F-002: the server honours an approver's id only with the PIN that proves the
// approver consented. The till used to send the id alone — which the server now
// ignores, so every manager-approved sale would have been refused at the counter.

const item = (over: Partial<CartItem>): CartItem => ({
  product: { id: 'p1', name: 'Cable', sku: 'CB-1' } as Product,
  quantity: 1,
  selectedUnit: 'piece',
  conversionFactor: 1,
  unitPrice: 8,
  frozenCostPrice: 6,
  discount: 0,
  lineTotal: 8,
  ...over,
});

const sentSale = async (draft: Parameters<typeof salesApi.complete>[0]) => {
  const fetch = vi.fn((url: string) => Promise.resolve(url === '/api/auth/csrf'
    ? new Response(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 't' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
    : new Response(JSON.stringify({ message: 'test stop' }), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    })));
  vi.stubGlobal('fetch', fetch);
  await expect(salesApi.complete(draft)).rejects.toThrow('test stop');
  const call = fetch.mock.calls.find(([url]) => url === '/api/sales') as unknown as [string, RequestInit];
  return JSON.parse(call[1].body as string);
};

describe('manager approval PINs — F-002', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends each approver with the PIN that proves them', async () => {
    const body = await sentSale({
      id: 's1', outletId: 'o1',
      cart: [item({
        floorPriceApproverId: 'm1', floorPriceApprovalPin: '4827',
        discountApproverId: 'm2', discountApprovalPin: '9134',
      })],
      cartDiscountPercent: 15, cartDiscountApproverId: 'm3', cartDiscountApprovalPin: '5551',
      payments: [{ method: 'cash', amount: 8 }],
    });

    expect(body.items[0]).toMatchObject({
      floorApprovedBy: 'm1', floorApprovalPin: '4827',
      discountApprovedBy: 'm2', discountApprovalPin: '9134',
    });
    expect(body).toMatchObject({ cartDiscountApprovedBy: 'm3', cartDiscountApprovalPin: '5551' });
  });

  it('sends no PIN where nobody approved anything', async () => {
    const body = await sentSale({
      id: 's2', outletId: 'o1',
      cart: [item({ floorPriceApprovalPin: '4827' })],
      cartDiscountApprovalPin: '5551',
      payments: [{ method: 'cash', amount: 8 }],
    });

    expect(body.items[0].floorApprovalPin).toBeUndefined();
    expect(body.cartDiscountApprovalPin).toBeUndefined();
  });

  it('keeps no PIN on the sale it stores afterwards', () => {
    const wire = {
      id: 's1', receiptNumber: 'R-1', outletId: 'o1', cashierName: 'Ama',
      subtotal: 800, discountTotal: 0, total: 800, changeDue: 0, status: 'COMPLETED',
      createdAt: '2026-11-07T10:00:00Z', items: [], payments: [],
    } as SaleWire;
    const stored = toCompletedSale(wire, [item({
      floorPriceApproverId: 'm1', floorPriceApprovalPin: '4827',
      discountApproverId: 'm2', discountApprovalPin: '9134',
    })], 'Main');

    expect(JSON.stringify(stored)).not.toMatch(/4827|9134/);
    expect(stored.items[0].floorPriceApproverId).toBe('m1');
  });
});
