/**
 * Local print service seam — FR-RCPT-01, 02, 05.
 *
 * Printing goes to an ESC/POS service running on the counter PC, not through the
 * browser print dialogue. This module is the boundary: the POS calls `printReceipt`
 * **after** the sale is committed, and a failure never blocks or reverses it — the
 * caller surfaces a retry strip instead (C-18).
 *
 * The real implementation POSTs to the local service (typically
 * http://localhost:{PRINT_SERVICE_PORT}/print). Until that service exists this
 * reports `service-unavailable`, which is the truthful answer and exercises the
 * failure path the PRD requires.
 */

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
  | { ok: true }
  | { ok: false; reason: 'service-unavailable' | 'printer-offline' | 'error'; detail: string };

export const PRINT_SERVICE_URL = 'http://localhost:9100/print';

/** Never throws. A print failure is a reportable outcome, not an exception. */
export async function printReceipt(job: PrintJob): Promise<PrintResult> {
  try {
    const response = await fetch(PRINT_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return { ok: false, reason: 'printer-offline', detail: `Print service returned ${response.status}.` };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: 'service-unavailable',
      detail: 'No local print service is reachable on this terminal.',
    };
  }
}
