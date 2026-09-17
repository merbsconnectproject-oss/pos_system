import { request } from './apiClient';

/**
 * Receipts — FR-RCPT.
 *
 * The receipt is rendered by the server, from the sale as stored. This module
 * exists so there is exactly one answer to "what does this receipt say".
 *
 * Before it, there were three. The point of sale sent the printer the receipt
 * *number* as its payload — not a receipt at all. The history screen sent a
 * layout built in `ThermalReceiptSlip`. And the server had a third, which
 * nothing used. Three implementations of one document, free to disagree, and the
 * one that actually printed at the counter was the broken one.
 */
export interface ReceiptWire {
  receiptNumber: string;
  width: '80mm' | '58mm';
  columns: number;
  /** FR-RCPT-06: whether the REPRINT band is on it. */
  reprint: boolean;
  /** The rendered text, one entry per printed line. What a preview should show. */
  lines: string[];
  /** The same lines as ESC/POS bytes, base64. What goes to the printer. */
  escPos: string;
}

export const receiptsApi = {
  /** The receipt for a sale, as it will print. */
  forSale: (saleId: string, width: '80mm' | '58mm' = '80mm') =>
    request<ReceiptWire>(`/api/receipts/sale/${saleId}?width=${width}`),

  /**
   * A second copy — marked and logged.
   *
   * A POST because it records something: the audit entry is written before the
   * render, so a reprint nobody can account for cannot happen. This replaces the
   * older two-step of auditing and then building the text separately.
   */
  reprint: (saleId: string, width: '80mm' | '58mm' = '80mm') =>
    request<ReceiptWire>(`/api/receipts/sale/${saleId}/reprint?width=${width}`, { method: 'POST' }),

  /**
   * The credit note for a return or swap.
   *
   * Through the same renderer as a sale receipt, so the two slips a customer
   * ends up holding look like they came from the same shop.
   */
  forReturn: (returnId: string, width: '80mm' | '58mm' = '80mm', reprint = false) =>
    request<ReceiptWire>(
      `/api/receipts/return/${returnId}?width=${width}&reprint=${reprint}`),

  /** FR-RCPT-09: the layout at a given width, before anything is sold. */
  preview: (width: '80mm' | '58mm' = '80mm') =>
    request<ReceiptWire>(`/api/receipts/preview?width=${width}`),
};

/** The printable text, for a preview that must match what prints exactly. */
export const receiptText = (receipt: ReceiptWire): string => receipt.lines.join('\n');
