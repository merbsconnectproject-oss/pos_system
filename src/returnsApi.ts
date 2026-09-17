import { request } from './apiClient';
import type { OutletId, ReturnExchangeRecord, ReturnItemDetail, ReturnReason } from './types';

/**
 * Returns and exchanges — `sale.refund`.
 *
 * A return is a credit note against a specific sale, so the server needs the
 * *line* each item was sold on: that is where the price the customer paid and
 * the cost frozen at the time both come from. The screen only knows which
 * product came back, so this module resolves the one to the other through
 * `returnable` before posting.
 *
 * It also means the shop can never take back more than was sold — the server
 * answers what is still returnable and refuses the rest.
 */
interface ReturnableWire {
  saleId: string;
  receiptNumber: string;
  voided: boolean;
  lines: {
    saleItemId: string;
    productId: string;
    productName: string;
    quantitySold: number;
    quantityAlreadyReturned: number;
    quantityReturnable: number;
    unitPrice: number;
  }[];
}

interface ReturnWire {
  id: string;
  returnNumber: string;
  originalSaleId: string;
  originalReceiptNumber: string | null;
  outletId: string;
  kind: 'REFUND' | 'EXCHANGE';
  refundTotalPesewas: number;
  exchangeSaleId: string | null;
  exchangeReceiptNumber: string | null;
  settlementPesewas: number;
  refundMethod: string | null;
  customerId: string | null;
  customerName: string | null;
  notes: string | null;
  cashierId: string;
  cashierName: string | null;
  createdAt: string;
  items: {
    saleItemId: string;
    productId: string;
    productName: string;
    quantityBase: number;
    unitPrice: number;
    lineRefundPesewas: number;
    reason: string;
    disposition: 'RESTOCK' | 'DAMAGED_WRITE_OFF' | 'SUPPLIER_RMA';
    dispositionLabel: string;
    conditionNotes: string | null;
    restocked: boolean;
  }[];
}

const SETTLEMENT_TO_WIRE: Record<string, string | null> = {
  Cash: 'CASH',
  'Mobile Money': 'MOBILE_MONEY',
  'Bank Transfer': 'BANK_TRANSFER',
  'Store Credit Voucher': 'EXCHANGE_CREDIT',
  'Even Swap': 'CASH',
};

const SETTLEMENT_FROM_WIRE: Record<string, ReturnExchangeRecord['settlementMethod']> = {
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Bank Transfer',
  EXCHANGE_CREDIT: 'Store Credit Voucher',
};

const toRecord = (wire: ReturnWire, outletName: string): ReturnExchangeRecord => ({
  id: wire.id,
  referenceNumber: wire.returnNumber,
  type: wire.kind === 'EXCHANGE' ? 'EXCHANGE_SWAP' : 'RETURN_REFUND',
  originalReceiptNumber: wire.originalReceiptNumber ?? '',
  originalSaleId: wire.originalSaleId,
  customerId: wire.customerId ?? undefined,
  customerName: wire.customerName ?? 'Walk-in Customer',
  outletId: wire.outletId as OutletId,
  outletName,
  cashierName: wire.cashierName ?? '',
  timestamp: wire.createdAt,
  returnedItems: wire.items.map((item): ReturnItemDetail => ({
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantityBase,
    unitPrice: item.unitPrice,
    lineTotal: item.lineRefundPesewas / 100,
    reason: item.reason as ReturnReason,
    disposition: item.disposition,
    conditionNotes: item.conditionNotes ?? undefined,
  })),
  // The replacement goods are an ordinary sale of their own; the credit note
  // records what came back, not what went out.
  swappedItems: [],
  returnedSubtotal: wire.refundTotalPesewas / 100,
  swappedSubtotal: (wire.refundTotalPesewas + wire.settlementPesewas) / 100,
  netDifference: wire.settlementPesewas / 100,
  settlementMethod: wire.refundMethod
    ? SETTLEMENT_FROM_WIRE[wire.refundMethod] ?? 'Cash'
    : 'Even Swap',
  settlementStatus: 'SETTLED',
  notes: wire.notes ?? undefined,
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The server reads ids as UUIDs; anything else is unreadable, not just invalid. */
const isUuid = (value: string | undefined | null): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export const returnsApi = {
  /** What may still be taken back against a receipt — the server's answer. */
  returnable: (saleId: string) => request<ReturnableWire>(`/api/returns/returnable/${saleId}`),

  list: (outletId?: string, outletName = '') => {
    const query = outletId && outletId !== 'all-outlets' ? `?outletId=${outletId}` : '';
    return request<ReturnWire[]>(`/api/returns${query}`)
      .then((rows) => rows.map((row) => toRecord(row, outletName)));
  },

  /**
   * Processes the return.
   *
   * @param terminalId needed only for an exchange, because the replacement is
   *                   rung up as a real sale and every sale belongs to a till
   */
  process: async (
    record: ReturnExchangeRecord,
    swapItems: { productId: string; quantity: number; unitPrice: number }[],
    terminalId: string | null,
    outletName = '',
  ): Promise<ReturnExchangeRecord> => {
    if (!record.originalSaleId) {
      throw new Error('Choose the original receipt first — a return is processed against a sale.');
    }

    // Resolve each returned product to the line it was sold on. The screen knows
    // the product; the server needs the line, because the price paid and the
    // frozen cost live there and neither can be recomputed later.
    const returnable = await returnsApi.returnable(record.originalSaleId);
    const items = record.returnedItems.map((item) => {
      const line = returnable.lines.find((candidate) => candidate.productId === item.productId);
      if (!line) {
        throw new Error(`${item.productName} is not on receipt ${returnable.receiptNumber}.`);
      }
      return {
        saleItemId: line.saleItemId,
        quantityBase: item.quantity,
        reason: item.reason,
        disposition: item.disposition,
        conditionNotes: item.conditionNotes || null,
      };
    });

    const isExchange = record.type === 'EXCHANGE_SWAP';
    const swapTotal = swapItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    const body: Record<string, unknown> = {
      originalSaleId: record.originalSaleId,
      kind: isExchange ? 'EXCHANGE' : 'REFUND',
      items,
      refundMethod: SETTLEMENT_TO_WIRE[record.settlementMethod] ?? 'CASH',
      notes: record.notes || null,
    };

    if (isExchange) {
      // The replacement is a real sale — its own receipt number, its own stock
      // movements, its own frozen cost. It is paid in full here and the returned
      // goods are refunded, so the drawer nets to the difference the customer
      // actually hands over.
      body.exchangeSale = {
        id: crypto.randomUUID(),
        outletId: record.outletId,
        terminalId,
        // Only a real id, never a made-up one. The server reads this as a UUID
        // and anything else is unreadable rather than merely wrong — which
        // surfaces as a 500 telling the counter to fetch a manager.
        customerId: isUuid(record.customerId) ? record.customerId : null,
        items: swapItems.map((item) => ({
          productId: item.productId,
          selectedUnit: 'pc',
          conversionFactor: 1,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        payments: [{
          id: crypto.randomUUID(),
          method: 'cash',
          amount: Math.round(swapTotal * 100),
        }],
      };
    }

    const saved = await request<ReturnWire>('/api/returns', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return toRecord(saved, outletName);
  },
};
