/**
 * Local in-process printing seam — FR-RCPT-01, 02, 05.
 *
 * Printing goes to the Spring server running on the counter PC, not through the
 * browser print dialogue. The server submits raw ESC/POS to the operating-system
 * spooler. This module is the boundary: the POS calls `printReceipt`
 * **after** the sale is committed, and a failure never blocks or reverses it — the
 * caller surfaces a retry strip instead (C-18).
 *
 */

import { ApiError, request } from './apiClient';

export interface PrintJob {
  receiptNumber: string;
  paperWidth: '58mm' | '80mm';
  /** FR-RCPT-06: reprints carry a REPRINT band. */
  isReprint?: boolean;
  /**
   * Base64 ESC/POS, rendered by the server.
   *
   * Not text assembled here. A receipt built in the browser states what the till
   * believed rather than what was recorded, and a reprint built that way could
   * differ from the original — the one thing a reprint must never do. The server
   * renders both from the stored sale, so they cannot.
   */
  payload: string;
}

export type PrintResult =
  /**
   * `printer` is the queue the server actually used, which is not necessarily
   * the one configured: the counter's printer is detected by name, so the only
   * honest way to tell the cashier where the paper came out is to report what
   * came back.
   */
  | { ok: true; printer: string }
  | { ok: false; reason: 'service-unavailable' | 'printer-offline' | 'error'; detail: string };

export const PRINT_SERVICE_URL = '/api/printing/receipt';

/** Never throws. A print failure is a reportable outcome, not an exception. */
export async function printReceipt(job: PrintJob): Promise<PrintResult> {
  try {
    const accepted = await request<{ ok: true; printer: string; receiptNumber: string }>(
      PRINT_SERVICE_URL,
      { method: 'POST', body: JSON.stringify(job) },
    );
    return { ok: true, printer: accepted.printer };
  } catch (error) {
    if (error instanceof ApiError && ['PRINTER_OFFLINE', 'PRINTER_NOT_FOUND'].includes(error.code)) {
      return { ok: false, reason: 'printer-offline', detail: error.message };
    }
    return {
      ok: false,
      reason: 'service-unavailable',
      detail: error instanceof Error ? error.message : 'The local print service is unavailable.',
    };
  }
}
