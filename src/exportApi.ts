/**
 * FR-SET-08: the client's own data, from the server.
 *
 * <p>Distinct from the per-screen CSV buttons, which write out whatever rows
 * the browser happens to have loaded. That is a useful thing and a different
 * promise: a shop asking for its data and receiving the last hundred receipts
 * has not received its data.
 *
 * <p>Fetched rather than linked, because the endpoint is behind the session
 * and `settings.general` — a plain anchor would send no credentials and the
 * shop would download a 401.
 */

import { filenameFrom, messageFromFailure, saveBlob } from './fileDownload';

export const exportApi = {
  /**
   * Download the whole business.
   *
   * @param format `JSON` for the full archive, `CSV` for the accounting zip.
   */
  download: async (format: 'JSON' | 'CSV') => {
    const response = await fetch(`/api/export?format=${format}`, {
      credentials: 'same-origin',
    });

    if (!response.ok) {
      // The body is the API's own error shape when it has one; a status alone
      // tells a shop owner nothing about what to do next.
      throw new Error(await messageFromFailure(
        response, `The export failed (${response.status}).`));
    }

    const today = new Date().toISOString().slice(0, 10);
    const fallback = format === 'JSON'
      ? `radiance-pos-export-${today}.json`
      : `radiance-pos-accounting-${today}.zip`;

    saveBlob(await response.blob(),
      filenameFrom(response.headers.get('Content-Disposition'), fallback));
  },
};
